import type { RxJsonSchema, MigrationStrategies } from 'rxdb';

/**
 * Empresa = one CNPJ/CPF the user has connected at some point.
 *
 * Mirrors the original `nsuPorEmpresa` map kept in chrome.storage.local,
 * but normalized as RxDB documents.
 *
 * Key is the digits-only CNPJ/CPF string.
 */
export interface EmpresaDoc {
  cnpj: string;
  razaoSocial: string;
  ultimoNSU: number;
  ultimaSync: string | null;
  cnpjConsulta: string;
  /**
   * True while a sync is running (set when it starts, cleared when it finishes
   * cleanly). If it's still true on app load, the previous sync was cut short
   * — e.g. the tab was closed — and we can offer to resume from `ultimoNSU`.
   */
  syncInterrupted: boolean;
  createdAt: number;
  updatedAt: number;
}

// Upper bound for our timestamp fields (Date.now() in ms). 9999999999999 ≈
// year 2286 — far enough out that we'll never bump into it, while keeping
// RxDB's index key encoding compact (13 digits instead of 16 for MAX_SAFE_INTEGER).
const TS_MAX = 9999999999999;

export const empresaSchema: RxJsonSchema<EmpresaDoc> = {
  title: 'empresa',
  version: 1,
  primaryKey: 'cnpj',
  type: 'object',
  properties: {
    cnpj: { type: 'string', maxLength: 14 },
    razaoSocial: { type: 'string', default: '' },
    ultimoNSU: { type: 'integer', default: 0, minimum: 0 },
    ultimaSync: { type: ['string', 'null'], default: null },
    cnpjConsulta: { type: 'string', default: '' },
    syncInterrupted: { type: 'boolean', default: false },
    createdAt: { type: 'integer', minimum: 0, maximum: TS_MAX, multipleOf: 1 },
    // Indexed: RxDB requires minimum + maximum + multipleOf on numeric index
    // fields (errors SC32 / SC35) so it can encode the value into a fixed-length
    // index key.
    updatedAt: { type: 'integer', minimum: 0, maximum: TS_MAX, multipleOf: 1 },
  },
  required: ['cnpj', 'razaoSocial', 'ultimoNSU', 'createdAt', 'updatedAt'],
  indexes: ['updatedAt'],
} as const;

/** v0 → v1: add the `syncInterrupted` resume flag (false for existing rows). */
export const empresaMigrationStrategies: MigrationStrategies = {
  1: (doc) => ({ ...doc, syncInterrupted: doc.syncInterrupted ?? false }),
};
