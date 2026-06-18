import { useCallback } from 'react';
import { extract, digits } from './format';
import { NfseTag as Tag } from './nfseTags';
import type {
  DistribuicaoNSU,
  PingAdnFailure,
  PingAdnOptions,
  PingAdnResult,
} from './types';

export type NfseTipoDocumento = 'NFSE' | 'EVENTO' | 'DPS' | 'DESCONHECIDO';

export interface NfseParty {
  doc: string;
  cnpj: string;
  cpf: string;
  nome: string;
  fantasia: string;
  inscricaoMunicipal: string;
}

export interface NfseMeta {
  tipoDocumento: NfseTipoDocumento;

  chave: string;
  chaveDPS: string;

  numeroNFSe: string;
  numeroDPS: string;
  numeroDFSe: string;
  serie: string;

  dhEmi: string;
  dhProc: string;
  dhEvento: string;
  dCompet: string;
  dataEmissaoISO: string;
  dataProcessamentoISO: string;
  dataEventoISO: string;
  competenciaISO: string;
  competenciaAno: string;
  competenciaMes: string;
  emissaoAno: string;
  emissaoMes: string;

  cStat: string;
  tpAmb: string;
  ambGer: string;
  tpEmis: string;
  procEmi: string;
  verAplic: string;

  prestador: NfseParty;
  tomador: NfseParty;

  cLocEmi: string;
  xLocEmi: string;
  cLocPrestacao: string;
  xLocPrestacao: string;
  cLocIncid: string;
  xLocIncid: string;
  municipio: string;

  descricaoServico: string;
  cTribNac: string;
  xTribNac: string;
  cTribMun: string;
  xTribMun: string;
  cNBS: string;
  xNBS: string;

  vServ: string;
  vLiq: string;
  vBC: string;
  pAliqAplic: string;
  vISSQN: string;
  vTotalRet: string;
  vTotNF: string;
  vIBSTot: string;
  vCBS: string;

  tpRetISSQN: string;
  vIRRF: string;
  vPIS: string;
  vCOFINS: string;
  vCSLL: string;
  vINSS: string;

  chSubstda: string;

  chaveReferenciada: string;
  chaveRejeitada: string;
  eventoDescricao: string;
  eventoMotivo: string;
  autorCnpj: string;

  outrasInformacoes: string;
}

function detectTipo(root: Element): NfseTipoDocumento {
  if (root.querySelector(Tag.TAG_INF_EVENTO)) return 'EVENTO';
  if (root.querySelector(Tag.TAG_INF_NFSE)) return 'NFSE';
  if (root.querySelector(Tag.TAG_INF_DPS)) return 'DPS';
  return 'DESCONHECIDO';
}

function parseChave(root: Element, container: Tag, prefixRegex: RegExp): string {
  const id = root.querySelector(container)?.getAttribute(Tag.ATTR_ID) ?? '';
  return id.replace(prefixRegex, '');
}

function parseParty(node: Element | null): NfseParty {
  if (!node) {
    return { doc: '', cnpj: '', cpf: '', nome: '', fantasia: '', inscricaoMunicipal: '' };
  }
  const cnpj = extract(node, Tag.TAG_CNPJ);
  const cpf = extract(node, Tag.TAG_CPF);
  return {
    doc: digits(cnpj || cpf),
    cnpj,
    cpf,
    nome: extract(node, Tag.TAG_X_NOME, Tag.TAG_X_RAZ_SOC, Tag.TAG_X_FANT),
    fantasia: extract(node, Tag.TAG_X_FANT),
    inscricaoMunicipal: extract(node, Tag.TAG_IM),
  };
}

/**
 * One parsed item paired with the raw XML and the NSU number — everything
 * the persistence layer needs to insert a row into the `notas` collection.
 */
export interface ParsedLoteItem {
  meta: NfseMeta;
  nsu: number;
  xml: string;
}

// ─── NSU range download ─────────────────────────────────────────────────────
// The download flow is split into small pure helpers + one async orchestrator
// so each piece is independently testable and the React UI can compose it
// with hooks (useApi.pingADN, RxDB persistence, toasts, …). This avoids a
// monolith that mixes input validation, pagination, range filtering, XML
// decoding, file-system writes and message formatting.

/** Hard ceiling on NSUs per range (matches the legacy guardrail). */
export const MAX_NSU_RANGE_SPAN = 1000;
/** Defensive cap on lote pagination to avoid infinite loops if ADN misbehaves. */
export const HARD_BATCH_LIMIT = 2000;

/**
 * Default name for an XML when the ADN payload doesn't carry one — moved out
 * of `CertificadoApp.tsx` so it can be reused by the range download flow.
 *
 * NSU is always part of the suffix so two distinct docs can never clash on
 * disk. Tiny on purpose: the rich variant from the legacy `fileNameFor` can
 * be ported when "salvar em pasta" comes back.
 */
export function buildNotaFileName(meta: NfseMeta, nsu: number): string {
  const numero = (meta.numeroNFSe || meta.numeroDPS || '').trim();
  const chave = (meta.chave || meta.chaveDPS || meta.chaveReferenciada || '').trim();
  const tail = chave ? chave.slice(-7) : '';
  const stem = numero || chave || `nsu-${nsu}`;
  const suffix = nsu > 0 ? `_${nsu}` : tail ? `_${tail}` : '';
  return `${stem}${suffix}.xml`;
}

/**
 * Validate and normalize the [de, ate] inputs the user typed in the UI.
 * `ate` defaults to `de` (single-NSU fetch) when it isn't provided.
 */
export interface NormalizedNSURange {
  de: number;
  ate: number;
}

export type NSURangeValidation =
  | { ok: true; range: NormalizedNSURange }
  | { ok: false; error: string };

export function validateNSURange(de: number, ate?: number | null): NSURangeValidation {
  if (!Number.isFinite(de) || de < 1) {
    return { ok: false, error: 'Informe o NSU "De" (número a partir de 1).' };
  }
  const top = Number.isFinite(ate as number) ? (ate as number) : de;
  if (top < de) {
    return { ok: false, error: 'O NSU "Até" precisa ser maior ou igual ao "De".' };
  }
  if (top - de > MAX_NSU_RANGE_SPAN) {
    return {
      ok: false,
      error: `Faixa muito grande (máx. ${MAX_NSU_RANGE_SPAN} por vez). Reduza pra não sobrecarregar o servidor.`,
    };
  }
  return { ok: true, range: { de, ate: top } };
}

/**
 * Partition one ADN lote against the requested [de, ate] range.
 *
 * - `entriesToParse`: in-range entries that carry an `ArquivoXml` payload.
 * - `nsusInRange`: every in-range NSU returned by the ADN (with or without
 *   XML) — feeds the "achados" set so resumo-only NSUs don't end up reported
 *   as ADN gaps.
 * - `semXmlInRange`: how many in-range NSUs came back as resumo (no XML).
 * - `maxNsu`: largest NSU seen in the lote — used as the next pagination
 *   cursor.
 * - `passouDoAte`: true when the lote already crossed the upper bound, so
 *   the caller can stop without one more roundtrip.
 */
export interface NSULotePartition {
  entriesToParse: DistribuicaoNSU[];
  nsusInRange: number[];
  semXmlInRange: number;
  maxNsu: number;
  passouDoAte: boolean;
}

function parseNsuValue(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  const n = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) ? n : NaN;
}

export function partitionLoteByRange(
  lote: DistribuicaoNSU[],
  de: number,
  ate: number,
  cursor: number,
): NSULotePartition {
  const entriesToParse: DistribuicaoNSU[] = [];
  const nsusInRange: number[] = [];
  let semXmlInRange = 0;
  let maxNsu = cursor;
  let passouDoAte = false;

  for (const entry of lote) {
    const nsu = parseNsuValue(entry.NSU);
    if (Number.isFinite(nsu) && nsu > maxNsu) maxNsu = nsu;
    if (!Number.isFinite(nsu) || nsu < de) continue;
    if (nsu > ate) {
      passouDoAte = true;
      continue;
    }
    nsusInRange.push(nsu);
    if (!entry.ArquivoXml) {
      semXmlInRange += 1;
      continue;
    }
    entriesToParse.push(entry);
  }

  return { entriesToParse, nsusInRange, semXmlInRange, maxNsu, passouDoAte };
}

/** Compute the NSUs the user asked for that the ADN never returned. */
export function computeBuracos(achados: Set<number>, de: number, ate: number): number[] {
  const out: number[] = [];
  for (let n = de; n <= ate; n += 1) {
    if (!achados.has(n)) out.push(n);
  }
  return out;
}

/** Render a sorted list of integers as compact ranges: `[1,2,3,7] → "1–3, 7"`. */
export function formatNSURangesPretty(nums: number[]): string {
  if (!nums.length) return '';
  const out: string[] = [];
  let start = nums[0];
  let end = nums[0];
  for (let i = 1; i < nums.length; i += 1) {
    if (nums[i] === end + 1) {
      end = nums[i];
      continue;
    }
    out.push(start === end ? `${start}` : `${start}–${end}`);
    start = end = nums[i];
  }
  out.push(start === end ? `${start}` : `${start}–${end}`);
  return out.join(', ');
}

// ─── Orchestrator: fetch one [de, ate] window ───────────────────────────────

/** Why the iteration loop stopped — drives the user-facing summary tone. */
export type FetchNSURangeStop =
  /** Walked past the upper bound — the happy path. */
  | 'covered'
  /** ADN replied 404 / NENHUM_DOCUMENTO_LOCALIZADO before the upper bound. */
  | 'empty'
  /** Hit `HARD_BATCH_LIMIT` or pagination cursor stopped advancing. */
  | 'truncated'
  /** Caller cancelled via `AbortSignal`. */
  | 'aborted'
  /** Network / HTTP failure aborted the loop. */
  | 'error';

export interface NSURangeProgress {
  /** 0-based pagination iteration counter. */
  iteration: number;
  /** Last NSU sent to the ADN (the next lote will return NSU > cursor). */
  cursor: number;
  /** Items already parsed and queued for persistence. */
  parsed: number;
  /** In-range NSUs returned without an XML payload. */
  semXml: number;
  /** Distinct in-range NSUs seen (with or without XML). */
  achados: number;
  /** Coarse 0..1 progress estimate for indeterminate UI. */
  ratio: number;
}

export interface FetchNSURangeOptions {
  de: number;
  ate?: number;
  /** ADN client — usually `useApi().pingADN`. Injected so this stays UI-free. */
  pingADN: (nsu: number, options?: PingAdnOptions) => Promise<PingAdnResult>;
  /** Cancellation token; the loop checks before/after every roundtrip. */
  signal?: AbortSignal;
  onProgress?: (info: NSURangeProgress) => void;
  onRetry?: PingAdnOptions['onRetry'];
}

export interface FetchNSURangeResult {
  de: number;
  ate: number;
  /** Decoded XMLs ready for `insertNotaIfNew` or disk download. */
  items: ParsedLoteItem[];
  /** Sorted list of in-range NSUs the ADN returned (any XML status). */
  achados: number[];
  /** In-range NSUs the ADN never mentioned — true ADN gaps. */
  buracos: number[];
  /** In-range NSUs returned as "resumo" (no XML payload). */
  semXml: number;
  rateLimited: boolean;
  stop: FetchNSURangeStop;
  /** Set when `stop === 'error'`. */
  error?: string;
}

function emptyRangeResult(
  de: number,
  ate: number,
  stop: FetchNSURangeStop,
  error?: string,
): FetchNSURangeResult {
  return {
    de,
    ate,
    items: [],
    achados: [],
    buracos: [],
    semXml: 0,
    rateLimited: false,
    stop,
    error,
  };
}

/**
 * Build the user-facing "Faixa NSU X–Y: …" status message.
 *
 * Ported verbatim (in spirit) from the tail of `baixarFaixaNSU` so the toast
 * the user sees keeps the same honest tone: salvos vs. resumo-only vs.
 * buracos-do-ADN vs. rate-limit vs. user-cancelled.
 */
export function buildRangeSummaryMessage(result: FetchNSURangeResult): string {
  const { de, ate, items, semXml, buracos, rateLimited, stop, error } = result;
  const saved = items.length;

  let msg =
    saved > 0
      ? `Faixa NSU ${de}–${ate}: ${saved} arquivo(s) baixado(s).`
      : `Faixa NSU ${de}–${ate}: nada novo pra salvar.`;

  if (semXml) msg += ` ${semXml} NSU vieram como resumo (sem XML).`;
  if (buracos.length) {
    const preview = formatNSURangesPretty(buracos.slice(0, 30));
    const ellipsis = buracos.length > 30 ? ', …' : '';
    msg += ` ${buracos.length} NSU não existem no ADN (${preview}${ellipsis}) — buraco da Receita, não há nota.`;
  }
  if (rateLimited) msg += ' O servidor limitou (429) — tente o restante daqui a pouco.';
  if (stop === 'aborted') msg += ' Parado por você.';
  if (stop === 'truncated') msg += ' Limite de lotes atingido — refaça a faixa em pedaços menores.';
  if (stop === 'error' && error) msg += ` Falha: ${error}.`;
  return msg;
}

export function useXml() {
  const decodeGzipBase64 = useCallback(async (gzipBase64: string) => {
    const bytes = Uint8Array.from(atob(gzipBase64), c => c.charCodeAt(0));

    if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
      return new TextDecoder().decode(bytes);
    }

    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }, []);

  function parseMeta(xml: string): NfseMeta | null {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.querySelector('parsererror')) return null;
    const root = doc.documentElement;
  
    const emit = root.querySelector(Tag.TAG_EMIT) ?? root.querySelector(Tag.TAG_PREST);
    const toma = root.querySelector(Tag.TAG_TOMA) ?? root.querySelector(Tag.TAG_TOMADOR);
  
    const dhEmi = extract(root, Tag.TAG_DH_EMI);
    const dhProc = extract(root, Tag.TAG_DH_PROC);
    const dhEvento = extract(root, Tag.TAG_DH_EVENTO);
    const dCompet = extract(root, Tag.TAG_D_COMPET);
  
    const dataEmissaoISO = (dhEmi || dhProc || dhEvento).slice(0, 10);
    const competenciaISO = dCompet || dataEmissaoISO;
  
    return {
      tipoDocumento: detectTipo(root),
  
      chave: parseChave(root, Tag.TAG_INF_NFSE, /^NFS/i),
      chaveDPS: parseChave(root, Tag.TAG_INF_DPS, /^DPS/i),
  
      numeroNFSe: extract(root, Tag.TAG_N_NFSE, Tag.TAG_N_DPS),
      numeroDPS: extract(root, Tag.TAG_N_DPS),
      numeroDFSe: extract(root, Tag.TAG_N_DFSE),
      serie: extract(root, Tag.TAG_SERIE),
  
      dhEmi,
      dhProc,
      dhEvento,
      dCompet,
      dataEmissaoISO,
      dataProcessamentoISO: dhProc.slice(0, 10),
      dataEventoISO: dhEvento.slice(0, 10),
      competenciaISO: competenciaISO.slice(0, 10),
      competenciaAno: competenciaISO.slice(0, 4),
      competenciaMes: competenciaISO.slice(0, 7),
      emissaoAno: dataEmissaoISO.slice(0, 4),
      emissaoMes: dataEmissaoISO.slice(0, 7),
  
      cStat: extract(root, Tag.TAG_C_STAT),
      tpAmb: extract(root, Tag.TAG_TP_AMB),
      ambGer: extract(root, Tag.TAG_AMB_GER),
      tpEmis: extract(root, Tag.TAG_TP_EMIS),
      procEmi: extract(root, Tag.TAG_PROC_EMI),
      verAplic: extract(root, Tag.TAG_VER_APLIC),
  
      prestador: parseParty(emit),
      tomador: parseParty(toma),
  
      cLocEmi: extract(root, Tag.TAG_C_LOC_EMI),
      xLocEmi: extract(root, Tag.TAG_X_LOC_EMI),
      cLocPrestacao: extract(root, Tag.TAG_C_LOC_PRESTACAO),
      xLocPrestacao: extract(root, Tag.TAG_X_LOC_PRESTACAO),
      cLocIncid: extract(root, Tag.TAG_C_LOC_INCID),
      xLocIncid: extract(root, Tag.TAG_X_LOC_INCID),
      municipio: extract(
        root,
        Tag.TAG_X_LOC_PRESTACAO,
        Tag.TAG_X_LOC_EMI,
        Tag.TAG_X_LOC_INCID,
        Tag.TAG_X_MUN_INC,
      ),
  
      descricaoServico: extract(root, Tag.TAG_X_DESC_SERV),
      cTribNac: extract(root, Tag.TAG_C_TRIB_NAC),
      xTribNac: extract(root, Tag.TAG_X_TRIB_NAC),
      cTribMun: extract(root, Tag.TAG_C_TRIB_MUN),
      xTribMun: extract(root, Tag.TAG_X_TRIB_MUN),
      cNBS: extract(root, Tag.TAG_C_NBS),
      xNBS: extract(root, Tag.TAG_X_NBS),
  
      vServ: extract(root, Tag.TAG_V_SERV, Tag.TAG_V_LIQ, Tag.TAG_V_NF),
      vLiq: extract(root, Tag.TAG_V_LIQ, Tag.TAG_V_SERV, Tag.TAG_V_NF),
      vBC: extract(root, Tag.TAG_V_BC),
      pAliqAplic: extract(root, Tag.TAG_P_ALIQ_APLIC),
      vISSQN: extract(root, Tag.TAG_V_ISSQN, Tag.TAG_V_ISS),
      vTotalRet: extract(root, Tag.TAG_V_TOTAL_RET),
      vTotNF: extract(root, Tag.TAG_V_TOT_NF),
      vIBSTot: extract(root, Tag.TAG_V_IBS_TOT),
      vCBS: extract(root, Tag.TAG_V_CBS),
  
      tpRetISSQN: extract(root, Tag.TAG_TP_RET_ISSQN),
      vIRRF: extract(root, Tag.TAG_V_RET_IRRF, Tag.TAG_V_IRRF, Tag.TAG_V_IR),
      vPIS: extract(root, Tag.TAG_V_PIS_LOWER, Tag.TAG_V_RET_PIS, Tag.TAG_V_PIS),
      vCOFINS: extract(root, Tag.TAG_V_COFINS_LOWER, Tag.TAG_V_RET_COFINS, Tag.TAG_V_COFINS),
      vCSLL: extract(root, Tag.TAG_V_RET_CSLL, Tag.TAG_V_CSLL),
      vINSS: extract(root, Tag.TAG_V_RET_CP, Tag.TAG_V_RET_INSS, Tag.TAG_V_INSS, Tag.TAG_V_CP),
  
      chSubstda: extract(root, Tag.TAG_CH_SUBSTDA),
  
      chaveReferenciada: extract(root, Tag.TAG_CH_NFSE),
      chaveRejeitada: extract(root, Tag.TAG_CH_NFSE_REJ),
      eventoDescricao: extract(root, Tag.TAG_X_DESC),
      eventoMotivo: extract(root, Tag.TAG_X_MOTIVO),
      autorCnpj: extract(root, Tag.TAG_CNPJ_AUTOR),
  
      outrasInformacoes: extract(root, Tag.TAG_X_OUT_INF),
    };
  }

  async function parseLote(lote: DistribuicaoNSU[]): Promise<ParsedLoteItem[]> {
    const items = await Promise.all(
      lote.map(async (entry): Promise<ParsedLoteItem | null> => {
        // "Resumo-only" entries arrive without a payload — there's nothing to
        // persist for those, so we drop them here instead of forcing every
        // caller to filter again.
        if (!entry.ArquivoXml) return null;
        const xmlString = await decodeGzipBase64(entry.ArquivoXml);
        const meta = parseMeta(xmlString);
        if (!meta) return null;

        const rawNsu = entry.NSU;
        const nsu =
          typeof rawNsu === 'number'
            ? rawNsu
            : Number.parseInt(String(rawNsu ?? ''), 10);

        return { meta, nsu: Number.isFinite(nsu) ? nsu : 0, xml: xmlString };
      }),
    );
    return items.filter((it): it is ParsedLoteItem => it !== null);
  }

  /**
   * Walk the ADN and collect every XML inside `[de, ate]`.
   *
   * Pure orchestration — no DOM, no toasts, no disk I/O. Hands callers the
   * decoded items, the gap analysis (resumo-only NSUs vs. true ADN holes),
   * and a precise stop reason so the UI can render an honest summary.
   *
   * Composed from the small helpers above:
   *   - `validateNSURange`        → input guards
   *   - `partitionLoteByRange`    → per-lote in-range filtering
   *   - `parseLote`               → gzip+XML decoding
   *   - `computeBuracos`          → real ADN holes
   *   - `buildRangeSummaryMessage`→ user-facing toast text
   */
  async function fetchNSURange(opts: FetchNSURangeOptions): Promise<FetchNSURangeResult> {
    const validation = validateNSURange(opts.de, opts.ate);
    if (!validation.ok) {
      return emptyRangeResult(opts.de, opts.ate ?? opts.de, 'error', validation.error);
    }
    const { de, ate } = validation.range;
    const { pingADN, signal, onProgress, onRetry } = opts;

    const items: ParsedLoteItem[] = [];
    const achadosSet = new Set<number>();
    let semXml = 0;
    let rateLimited = false;
    let cursor = de - 1; // ADN returns NSU > cursor → start one below `de`
    let stop: FetchNSURangeStop = 'truncated';
    let errorMsg: string | undefined;

    const reportProgress = (iteration: number) => {
      if (!onProgress) return;
      const span = ate - de + 1;
      const ratio = span > 0 ? Math.min(1, Math.max(0, (cursor - de + 1) / span)) : 0;
      onProgress({
        iteration,
        cursor,
        parsed: items.length,
        semXml,
        achados: achadosSet.size,
        ratio,
      });
    };

    for (let i = 0; i < HARD_BATCH_LIMIT; i += 1) {
      if (signal?.aborted) {
        stop = 'aborted';
        break;
      }

      const resp = await pingADN(cursor, { onRetry });
      if (signal?.aborted) {
        stop = 'aborted';
        break;
      }

      if (!resp.ok) {
        const failure = resp as PingAdnFailure;
        // 404 = nothing past this NSU — same as "covered" since the rest
        // of the requested range simply doesn't exist on the ADN side.
        if (failure.status === 404) {
          stop = 'empty';
          break;
        }
        rateLimited = failure.status === 429;
        errorMsg = failure.error || (failure.status ? `HTTP ${failure.status}` : 'falha');
        stop = 'error';
        break;
      }

      const lote = resp.data?.LoteDFe ?? [];
      const status = resp.data?.StatusProcessamento;
      if (status === 'NENHUM_DOCUMENTO_LOCALIZADO' || lote.length === 0) {
        stop = 'empty';
        break;
      }

      const partition = partitionLoteByRange(lote, de, ate, cursor);
      for (const nsu of partition.nsusInRange) achadosSet.add(nsu);
      semXml += partition.semXmlInRange;

      if (partition.entriesToParse.length) {
        const parsed = await parseLote(partition.entriesToParse);
        items.push(...parsed);
      }

      reportProgress(i);

      if (partition.passouDoAte || partition.maxNsu >= ate) {
        stop = 'covered';
        break;
      }
      // Cursor didn't move forward — bail out instead of looping forever.
      if (partition.maxNsu <= cursor) {
        stop = 'truncated';
        break;
      }
      cursor = partition.maxNsu;
    }

    return {
      de,
      ate,
      items,
      achados: Array.from(achadosSet).sort((a, b) => a - b),
      buracos: computeBuracos(achadosSet, de, ate),
      semXml,
      rateLimited,
      stop,
      error: errorMsg,
    };
  }

  return { decodeGzipBase64, parseMeta, parseLote, fetchNSURange };
}
