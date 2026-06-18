import type {
  DistribuicaoNSU,
  PingAdnFailure,
  PingAdnOptions,
  PingAdnResult,
} from './types';
import type { EmpresaCollection } from '../db';
import { type NotaCollection, bulkInsertNotasIfNew } from '../db/schemas/nota';
import { buildNotaFileName, type ParsedLoteItem } from './useXml';

/**
 * Incremental ADN sync that persists into the RxDB `notas` collection instead
 * of the file system.
 *
 * Key behaviours:
 *  - Resume from the stored cursor: the ADN returns NSU *strictly greater*
 *    than the one requested, so the first fetch asks for `prevNSU` (not
 *    `prevNSU + 1`) to avoid the 51/102/153 gap bug.
 *  - Throttling/backoff for 429/5xx lives in `pingADN` (useApi) — we just
 *    forward `onRetry` so the UI can show "tentando de novo…".
 *  - The cursor is persisted *after every batch*, so a sync cut short (tab
 *    closed, 429, network drop) can be resumed from where it stopped instead
 *    of re-downloading everything.
 *
 * "Multithreading": fetching is necessarily sequential (each batch's cursor
 * depends on the previous one), but the per-batch work — gzip decode (parallel
 * in `parseLote`) + persistence (`bulkInsert`) — is the part that used to be
 * the bottleneck and is now batched/concurrent.
 */

export const SYNC_HARD_BATCH_LIMIT = 2000;

export interface SyncCounters {
  /** New notas written to the DB. */
  inserted: number;
  /** Notas the DB already had (dropped on `chave` collision). */
  duplicates: number;
  /** Entries that errored while decoding/parsing/persisting. */
  failed: number;
  /** In-range entries returned without an XML payload (resumo/evento). */
  semXml: number;
  /** Total LoteDFe entries seen across every batch. */
  seen: number;
  /** Number of ADN round-trips that returned documents. */
  batches: number;
}

export type SyncStopReason =
  /** Reached the end of the mailbox (404 / empty lote past the cursor). */
  | 'covered'
  /** Cancelled by the user via the AbortSignal. */
  | 'aborted'
  /** Server throttled us (429) — partial, safe to resume later. */
  | 'rate-limited'
  /** Network/HTTP failure aborted the loop. */
  | 'error'
  /** Hit the hard batch ceiling or the cursor stopped advancing. */
  | 'truncated';

export interface SyncProgressInfo {
  cnpj: string;
  /** Last NSU asked of the ADN. */
  cursorNSU: number;
  /** Highest NSU seen so far (the resume cursor). */
  highestNSU: number;
  counters: SyncCounters;
  /** Coarse 0..100 estimate for the progress bar. */
  percent: number;
  label: string;
  /** Sample of error strings collected so far. */
  errors: string[];
}

export interface RunSyncResult {
  cnpj: string;
  fromZero: boolean;
  startNSU: number;
  highestNSU: number;
  counters: SyncCounters;
  errors: string[];
  stop: SyncStopReason;
  elapsedMs: number;
}

export interface RunSyncDeps {
  pingADN: (nsu: number, options?: PingAdnOptions) => Promise<PingAdnResult>;
  parseLote: (lote: DistribuicaoNSU[]) => Promise<ParsedLoteItem[]>;
  notas: NotaCollection;
  empresas: EmpresaCollection;
}

export interface RunSyncOptions {
  /** Digits-only CNPJ/CPF of the mailbox to sync (the empresa primary key). */
  cnpj: string;
  razaoSocial?: string;
  cnpjConsulta?: string;
  /** Ignore the stored cursor and walk the whole mailbox from NSU 0. */
  fromZero?: boolean;
  signal?: AbortSignal;
  onProgress?: (info: SyncProgressInfo) => void;
  onRetry?: PingAdnOptions['onRetry'];
}

function emptyCounters(): SyncCounters {
  return { inserted: 0, duplicates: 0, failed: 0, semXml: 0, seen: 0, batches: 0 };
}

function parseNsu(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  const n = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) ? n : NaN;
}

/** Push the resume cursor + ultimaSync into the empresa row. */
async function persistEmpresa(
  empresas: EmpresaCollection,
  cnpj: string,
  patch: Partial<{
    ultimoNSU: number;
    ultimaSync: string | null;
    syncInterrupted: boolean;
    razaoSocial: string;
    cnpjConsulta: string;
  }>,
): Promise<void> {
  const doc = await empresas.findOne(cnpj).exec();
  if (!doc) return;
  await doc.patch({ ...patch, updatedAt: Date.now() });
}

export async function runSync(
  deps: RunSyncDeps,
  opts: RunSyncOptions,
): Promise<RunSyncResult> {
  const { pingADN, parseLote, notas, empresas } = deps;
  const { cnpj, fromZero = false, signal, onProgress, onRetry } = opts;

  const counters = emptyCounters();
  const errors: string[] = [];
  const t0 = Date.now();

  // Resolve the starting cursor from the stored NSU (unless fromZero).
  const empresaDoc = await empresas.findOne(cnpj).exec();
  const prevNSU = empresaDoc?.get('ultimoNSU') ?? 0;
  const startNSU = fromZero ? 0 : (prevNSU > 0 ? prevNSU + 1 : 0);

  // Mark the sync as in-flight so a tab close leaves a resumable breadcrumb.
  await persistEmpresa(empresas, cnpj, {
    syncInterrupted: true,
    razaoSocial: opts.razaoSocial || empresaDoc?.get('razaoSocial') || '',
    cnpjConsulta: opts.cnpjConsulta || empresaDoc?.get('cnpjConsulta') || '',
  });

  // The ADN returns NSU strictly greater than the one requested, so we ask for
  // `startNSU - 1` (== prevNSU) to avoid skipping a brand-new doc that landed
  // exactly at the cursor. fromZero → highestNSU = 0 → first fetch DFe/0.
  let highestNSU = startNSU > 0 ? startNSU - 1 : 0;
  let nsu = highestNSU;
  let stop: SyncStopReason = 'truncated';

  const emit = (label: string) => {
    onProgress?.({
      cnpj,
      cursorNSU: nsu,
      highestNSU,
      counters: { ...counters },
      percent: Math.min(95, 8 + counters.batches * 6),
      label,
      errors: errors.slice(0, 20),
    });
  };

  emit(
    startNSU > 0
      ? `Buscando documentos novos após o NSU ${startNSU - 1}…`
      : 'Buscando documentos desde o início…',
  );

  try {
    for (let i = 0; i < SYNC_HARD_BATCH_LIMIT; i += 1) {
      if (signal?.aborted) {
        stop = 'aborted';
        break;
      }

      const resp = await pingADN(nsu, { onRetry });

      if (signal?.aborted) {
        stop = 'aborted';
        break;
      }

      if (!resp.ok) {
        const failure = resp as PingAdnFailure;
        // 404 = nothing past this NSU → normal end of mailbox.
        if (failure.status === 404) {
          stop = 'covered';
          break;
        }
        const motivo =
          failure.error || (failure.status ? `HTTP ${failure.status}` : 'falha');
        if (counters.batches > 0 || counters.seen > 0) {
          // We already have progress — treat as a resumable interruption
          // rather than a hard failure (429 / 5xx / timeout).
          stop = failure.status === 429 ? 'rate-limited' : 'error';
          errors.push(`Interrompido no NSU ${nsu}: ${motivo}`);
        } else {
          stop = 'error';
          errors.push(`Lote NSU ${nsu}: ${motivo}`);
        }
        break;
      }

      const lote = resp.data?.LoteDFe ?? [];
      const status = resp.data?.StatusProcessamento;
      if (status === 'NENHUM_DOCUMENTO_LOCALIZADO' || lote.length === 0) {
        stop = 'covered';
        break;
      }

      counters.batches += 1;

      // 1) Synchronous pass: advance the cursor + count what's there.
      let batchMax = highestNSU;
      let noXmlInBatch = 0;
      for (const d of lote) {
        const n = parseNsu(d.NSU);
        if (Number.isFinite(n) && n > batchMax) batchMax = n;
        counters.seen += 1;
        if (!d.ArquivoXml) noXmlInBatch += 1;
      }
      counters.semXml += noXmlInBatch;

      // 2) Decode (parallel inside parseLote) + persist (bulk).
      const items = await parseLote(lote);
      const failedParse = lote.length - noXmlInBatch - items.length;
      if (failedParse > 0) counters.failed += failedParse;

      if (items.length) {
        try {
          const res = await bulkInsertNotasIfNew(
            notas,
            items.map((it) => ({
              meta: it.meta,
              nsu: it.nsu,
              xml: it.xml,
              name: buildNotaFileName(it.meta, it.nsu),
              ownerDoc: cnpj,
            })),
          );
          counters.inserted += res.inserted;
          counters.duplicates += res.duplicates;
          counters.failed += res.failed;
        } catch (err) {
          counters.failed += items.length;
          errors.push(`Gravação NSU ${nsu}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Persist the resume cursor every batch (incremental durability).
      if (batchMax > highestNSU) {
        highestNSU = batchMax;
        await persistEmpresa(empresas, cnpj, { ultimoNSU: highestNSU });
      }

      emit(`Lote a partir do NSU ${highestNSU}… ${counters.inserted} nova(s)`);

      // Cursor didn't advance → bail to avoid an infinite loop.
      if (batchMax <= nsu) {
        stop = 'covered';
        break;
      }
      nsu = highestNSU;
    }
  } catch (err) {
    stop = 'error';
    errors.push(err instanceof Error ? err.message : String(err));
  }

  // Final persistence. On a clean finish clear the interrupted flag and stamp
  // ultimaSync; on an abort/error keep the cursor but leave the breadcrumb so
  // the user can resume.
  const cleanFinish = stop === 'covered' || stop === 'truncated';
  await persistEmpresa(empresas, cnpj, {
    ultimoNSU: highestNSU,
    ...(cleanFinish
      ? { ultimaSync: new Date().toISOString(), syncInterrupted: false }
      : { syncInterrupted: stop !== 'aborted' ? true : false }),
  });

  return {
    cnpj,
    fromZero,
    startNSU,
    highestNSU,
    counters,
    errors,
    stop,
    elapsedMs: Date.now() - t0,
  };
}

/** Human-readable wrap-up for the toast/floating widget. */
export function buildSyncSummary(result: RunSyncResult): {
  severity: 'success' | 'warn' | 'error';
  message: string;
} {
  const { counters, stop, highestNSU, errors } = result;
  const base =
    `${counters.inserted} nova(s) · ${counters.duplicates} já existiam` +
    (counters.semXml ? ` · ${counters.semXml} resumo(s) sem XML` : '') +
    (counters.failed ? ` · ${counters.failed} com erro` : '');

  if (stop === 'aborted') {
    return { severity: 'warn', message: `Parado por você. ${base}. Último NSU: ${highestNSU}.` };
  }
  if (stop === 'rate-limited') {
    return {
      severity: 'warn',
      message: `O servidor limitou (429). Parcial: ${base}. Aguarde e clique em Sincronizar de novo (continua do NSU ${highestNSU}).`,
    };
  }
  if (stop === 'error') {
    const why = errors[0] ? ` (${errors[0]})` : '';
    return {
      severity: counters.inserted > 0 ? 'warn' : 'error',
      message: `Sincronização interrompida${why}. Parcial: ${base}. Último NSU: ${highestNSU}.`,
    };
  }

  if (counters.inserted === 0 && counters.duplicates === 0 && counters.seen === 0) {
    return { severity: 'success', message: 'Tudo em dia — nenhum documento novo.' };
  }
  return {
    severity: counters.failed ? 'warn' : 'success',
    message: `Concluído! ${base}. Último NSU: ${highestNSU}.`,
  };
}
