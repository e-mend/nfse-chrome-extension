import type { RxJsonSchema } from 'rxdb';

/**
 * Simple key/value bag for UI preferences.
 *
 * Equivalent to the scattered `chrome.storage.local` keys in the original
 * (orgNome, orgSub, escolherPasta, etc.), centralized in a single collection
 * so the React layer reads them through `useRxQuery` and re-renders reactively.
 */
export interface SettingDoc {
  key: string;
  value: string;
  updatedAt: number;
}

// Upper bound for `updatedAt` (Date.now() in ms). Not strictly required here
// because the field is not indexed, but keeping the same shape as `empresa`
// avoids surprises if we ever add an index later.
const TS_MAX = 9999999999999;

export const settingSchema: RxJsonSchema<SettingDoc> = {
  title: 'setting',
  version: 0,
  primaryKey: 'key',
  type: 'object',
  properties: {
    key: { type: 'string', maxLength: 64 },
    value: { type: 'string' },
    updatedAt: { type: 'integer', minimum: 0, maximum: TS_MAX, multipleOf: 1 },
  },
  required: ['key', 'value', 'updatedAt'],
} as const;
