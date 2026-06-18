import type { MangoQuery, RxCollection, RxDocument, RxJsonSchema, MigrationStrategies } from 'rxdb';
import type { NfseMeta, NfseTipoDocumento } from '../../lib/useXml';

/**
 * One row per XML downloaded from the ADN. Top-level fields mirror a few
 * `meta.*` values so RxDB can build proper indexes for fast filtering and
 * sorting on the PrimeReact DataTable; the full parsed payload still lives
 * in `meta` for richer detail views.
 */
export interface NotaDoc {
  chave: string;
  nsu: number;
  dataEmissaoISO: string;
  competenciaMes: string;
  prestadorDoc: string;
  tomadorDoc: string;
  /**
   * Digits-only CNPJ/CPF of the mailbox (empresa) this nota was synced from.
   * Lets us scope "todas as notas da empresa X" precisely — used by the
   * resync-from-zero flow to wipe only that company's notas.
   */
  ownerDoc: string;
  tipoDocumento: NfseTipoDocumento;
  meta: NfseMeta;
  xml: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export type NotaCollection = RxCollection<NotaDoc>;
export type NotaDocument = RxDocument<NotaDoc>;

const TS_MAX = 9999999999999;
const TIPO_DOC_VALUES: NfseTipoDocumento[] = ['NFSE', 'EVENTO', 'DPS', 'DESCONHECIDO'];

export const notaSchema: RxJsonSchema<NotaDoc> = {
  title: 'nota',
  version: 1,
  primaryKey: 'chave',
  type: 'object',
  properties: {
    chave: { type: 'string', maxLength: 64 },
    nsu: { type: 'integer', minimum: 0, maximum: 9999999999, multipleOf: 1 },
    dataEmissaoISO: { type: 'string', maxLength: 10, default: '' },
    competenciaMes: { type: 'string', maxLength: 7, default: '' },
    prestadorDoc: { type: 'string', maxLength: 14, default: '' },
    tomadorDoc: { type: 'string', maxLength: 14, default: '' },
    ownerDoc: { type: 'string', maxLength: 14, default: '' },
    tipoDocumento: { type: 'string', maxLength: 16, enum: TIPO_DOC_VALUES, default: 'DESCONHECIDO' },
    meta: { type: 'object' },
    xml: { type: 'string' },
    name: { type: 'string', maxLength: 255 },
    createdAt: { type: 'integer', minimum: 0, maximum: TS_MAX, multipleOf: 1 },
    updatedAt: { type: 'integer', minimum: 0, maximum: TS_MAX, multipleOf: 1 },
  },
  required: [
    'chave',
    'nsu',
    'dataEmissaoISO',
    'competenciaMes',
    'prestadorDoc',
    'tomadorDoc',
    'ownerDoc',
    'tipoDocumento',
    'meta',
    'xml',
    'name',
    'createdAt',
    'updatedAt',
  ],
  indexes: [
    'dataEmissaoISO',
    'competenciaMes',
    'prestadorDoc',
    'tomadorDoc',
    'ownerDoc',
    'tipoDocumento',
    'createdAt',
    'updatedAt',
  ],
} as const;

/**
 * v0 → v1: introduce `ownerDoc`. Old rows predate per-mailbox tracking, so we
 * best-effort backfill from prestador (emitidas tend to dominate a mailbox);
 * the resync-from-zero delete also matches prestador/tomador as a fallback,
 * so an empty ownerDoc here is still recoverable.
 */
export const notaMigrationStrategies: MigrationStrategies = {
  1: (doc) => ({ ...doc, ownerDoc: doc.ownerDoc ?? doc.prestadorDoc ?? '' }),
};

// ─── Insert ─────────────────────────────────────────────────────────────────

export interface NotaInsertInput {
  meta: NfseMeta;
  nsu: number;
  xml: string;
  name: string;
  /** Mailbox owner (empresa) this nota came from. */
  ownerDoc?: string;
}

export interface InsertNotaResult {
  inserted: boolean;
  doc: NotaDocument;
}

/**
 * Stable primary key. Falls back to the DPS / event / NSU id when the doc
 * has no NFS-e access key (events and orphan DPS), so every nota still gets
 * a unique deterministic identifier.
 */
export function computeNotaChave(meta: NfseMeta, nsu: number): string {
  if (meta.chave) return meta.chave;
  if (meta.chaveDPS) return `dps:${meta.chaveDPS}`;
  if (meta.chaveReferenciada) return `evt:${meta.chaveReferenciada}:${nsu}`;
  return `unk:${nsu}`;
}

export function buildNotaDoc(input: NotaInsertInput, chave: string, now: number): NotaDoc {
  const { meta } = input;
  return {
    chave,
    nsu: input.nsu,
    dataEmissaoISO: meta.dataEmissaoISO,
    competenciaMes: meta.competenciaMes,
    prestadorDoc: meta.prestador.doc,
    tomadorDoc: meta.tomador.doc,
    ownerDoc: input.ownerDoc ?? '',
    tipoDocumento: meta.tipoDocumento,
    meta,
    xml: input.xml,
    name: input.name,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Insert only when no nota with the same `chave` exists. Returns the existing
 * doc unchanged on collision (`inserted: false`) — the caller can decide
 * whether to update or skip.
 */
export async function insertNotaIfNew(
  collection: NotaCollection,
  input: NotaInsertInput,
): Promise<InsertNotaResult> {
  const chave = computeNotaChave(input.meta, input.nsu);
  const existing = await collection.findOne(chave).exec();
  if (existing) return { inserted: false, doc: existing };

  const doc = await collection.insert(buildNotaDoc(input, chave, Date.now()));
  return { inserted: true, doc };
}

export interface BulkInsertResult {
  inserted: number;
  duplicates: number;
  failed: number;
}

/**
 * Insert a batch of notas in one shot, skipping any whose `chave` already
 * exists. Much faster than calling `insertNotaIfNew` in a loop: we resolve all
 * the existing keys with a single `findByIds` and hand the rest to RxDB's
 * `bulkInsert` — the throughput win the legacy code chased with its parallel
 * write workers, now that persistence is the DB instead of the file system.
 */
export async function bulkInsertNotasIfNew(
  collection: NotaCollection,
  inputs: NotaInsertInput[],
): Promise<BulkInsertResult> {
  if (inputs.length === 0) return { inserted: 0, duplicates: 0, failed: 0 };

  const now = Date.now();
  // De-dupe within the batch first (two NSUs can carry the same chave, e.g. a
  // nota plus its own resumo) so bulkInsert never sees a self-collision.
  const byChave = new Map<string, NotaDoc>();
  for (const input of inputs) {
    const chave = computeNotaChave(input.meta, input.nsu);
    if (!byChave.has(chave)) byChave.set(chave, buildNotaDoc(input, chave, now));
  }
  const intraBatchDupes = inputs.length - byChave.size;

  const existing = await collection.findByIds(Array.from(byChave.keys())).exec();
  const toInsert: NotaDoc[] = [];
  for (const [chave, doc] of byChave) {
    if (!existing.has(chave)) toInsert.push(doc);
  }
  const alreadyStored = byChave.size - toInsert.length;

  if (toInsert.length === 0) {
    return { inserted: 0, duplicates: intraBatchDupes + alreadyStored, failed: 0 };
  }

  const res = await collection.bulkInsert(toInsert);
  const failed = res.error.length;
  return {
    inserted: res.success.length,
    duplicates: intraBatchDupes + alreadyStored,
    failed,
  };
}

/**
 * Remove every nota tied to an empresa. Matches the explicit `ownerDoc` first,
 * then falls back to prestador/tomador so notas stored before `ownerDoc`
 * existed (v0 rows) are still wiped on a resync-from-zero.
 */
export async function deleteNotasByOwner(
  collection: NotaCollection,
  ownerDoc: string,
): Promise<number> {
  const removed = await collection
    .find({
      selector: {
        $or: [{ ownerDoc }, { prestadorDoc: ownerDoc }, { tomadorDoc: ownerDoc }],
      },
    })
    .remove();
  return removed.length;
}

/** Count notas tied to an empresa (same matching rules as the delete above). */
export async function countNotasByOwner(
  collection: NotaCollection,
  ownerDoc: string,
): Promise<number> {
  return collection
    .count({
      selector: {
        $or: [{ ownerDoc }, { prestadorDoc: ownerDoc }, { tomadorDoc: ownerDoc }],
      },
    })
    .exec();
}

// ─── Query ──────────────────────────────────────────────────────────────────

export type NotaSortField =
  | 'chave'
  | 'nsu'
  | 'dataEmissaoISO'
  | 'competenciaMes'
  | 'prestadorDoc'
  | 'tomadorDoc'
  | 'tipoDocumento'
  | 'createdAt'
  | 'updatedAt';

export interface NotaQueryOptions {
  tipoDocumento?: NfseTipoDocumento;
  competenciaMes?: string;
  competenciaAno?: string;
  prestadorDoc?: string;
  tomadorDoc?: string;
  /**
   * Filter by the empresa/certificate the nota was saved under. The cleanest
   * way to keep two companies' notas apart when they appear in each other's
   * documents (one is prestador, the other tomador).
   */
  ownerDoc?: string;
  /** Inclusive ISO lower bound on `dataEmissaoISO` (YYYY-MM-DD). */
  dataFromISO?: string;
  /** Inclusive ISO upper bound on `dataEmissaoISO`. */
  dataToISO?: string;
  /** Free-text match against prestador/tomador name, chave and numeroNFSe. */
  search?: string;
  sortField?: NotaSortField;
  sortOrder?: 'asc' | 'desc';
  /** 1-based page number. Ignored when `pageSize` is unset. */
  page?: number;
  pageSize?: number;
}

/**
 * Build a Mango query for the notas collection — drop-in for
 * `collection.find()`, `useLiveRxQuery({ query })` and PrimeReact's lazy
 * DataTable (just feed `first`, `rows`, `sortField`, `sortOrder` from the
 * onPage / onSort handlers into `page`, `pageSize`, `sortField`, `sortOrder`).
 */
export function buildNotaQuery(opts: NotaQueryOptions = {}): MangoQuery<NotaDoc> {
  const selector: MangoQuery<NotaDoc>['selector'] = {};

  if (opts.tipoDocumento) selector.tipoDocumento = opts.tipoDocumento;
  if (opts.competenciaMes) selector.competenciaMes = opts.competenciaMes;
  else if (opts.competenciaAno) selector.competenciaMes = { $regex: `^${opts.competenciaAno}-` };

  if (opts.prestadorDoc) selector.prestadorDoc = opts.prestadorDoc;
  if (opts.tomadorDoc) selector.tomadorDoc = opts.tomadorDoc;
  if (opts.ownerDoc) selector.ownerDoc = opts.ownerDoc;

  if (opts.dataFromISO || opts.dataToISO) {
    const range: { $gte?: string; $lte?: string } = {};
    if (opts.dataFromISO) range.$gte = opts.dataFromISO;
    if (opts.dataToISO) range.$lte = opts.dataToISO;
    selector.dataEmissaoISO = range;
  }

  const search = opts.search?.trim();
  if (search) {
    const or: NonNullable<MangoQuery<NotaDoc>['selector']>['$or'] = [
      { 'meta.prestador.nome': { $regex: search, $options: 'i' } },
      { 'meta.tomador.nome': { $regex: search, $options: 'i' } },
      { 'meta.numeroNFSe': { $regex: search, $options: 'i' } },
      { chave: { $regex: search, $options: 'i' } },
    ];
    // If the user pasted a (possibly formatted) CNPJ/CPF, match the digits
    // against the indexed `prestadorDoc` / `tomadorDoc` columns too. This is
    // what makes "search by empresa" work: every nota an empresa appears in
    // (as either prestador or tomador) lights up with a single search term.
    const searchDigits = search.replace(/\D/g, '');
    if (searchDigits.length >= 3) {
      or.push({ prestadorDoc: { $regex: searchDigits } });
      or.push({ tomadorDoc: { $regex: searchDigits } });
    }
    selector.$or = or;
  }

  const sortField: NotaSortField = opts.sortField ?? 'dataEmissaoISO';
  const sortOrder = opts.sortOrder ?? 'desc';
  const sort = [{ [sortField]: sortOrder }] as MangoQuery<NotaDoc>['sort'];

  const query: MangoQuery<NotaDoc> = { selector, sort };

  if (opts.pageSize && opts.pageSize > 0) {
    query.limit = opts.pageSize;
    if (opts.page && opts.page > 1) query.skip = (opts.page - 1) * opts.pageSize;
  }

  return query;
}

/** One-shot fetch returning plain JSON rows — ready for `<DataTable value=…>`. */
export async function findNotas(
  collection: NotaCollection,
  opts: NotaQueryOptions = {},
): Promise<NotaDoc[]> {
  const docs = await collection.find(buildNotaQuery(opts)).exec();
  return docs.map((d) => d.toJSON() as NotaDoc);
}

/** Total matching docs ignoring pagination — feeds DataTable's `totalRecords`. */
export async function countNotas(
  collection: NotaCollection,
  opts: NotaQueryOptions = {},
): Promise<number> {
  const { selector } = buildNotaQuery({ ...opts, page: undefined, pageSize: undefined });
  return collection.count({ selector }).exec();
}

/** Single-doc lookup by primary key. */
export async function getNotaByChave(
  collection: NotaCollection,
  chave: string,
): Promise<NotaDoc | null> {
  const doc = await collection.findOne(chave).exec();
  return doc ? (doc.toJSON() as NotaDoc) : null;
}
