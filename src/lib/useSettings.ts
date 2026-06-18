import { useCallback, useMemo } from 'react';
import { useLiveRxQuery, useRxCollection } from 'rxdb/plugins/react';
import type { MangoQuery } from 'rxdb';
import type { SettingDoc } from '../db/schemas/settings';

/**
 * Centralized keys for the `settings` key/value collection. Mirrors the
 * scattered `chrome.storage.local` keys from the legacy extension.
 */
export const SETTING_KEYS = {
  /** Human-readable name of the chosen destination folder (display only). */
  pastaNome: 'pastaNome',
  /** File-naming scheme for NFS-e XML: 'num' | 'datanum'. */
  orgNome: 'orgNome',
  /** Naming pattern (token template) used when downloading the DANFSe PDF. */
  pdfNamePattern: 'pdfNamePattern',
  /**
   * Max width of the app container (e.g. '1200px' or '100%'). Lets the user
   * widen the layout so the notas table has more room.
   */
  containerWidth: 'containerWidth',
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

interface UseSettingResult<T extends string> {
  value: T | null;
  setValue: (value: T) => Promise<void>;
  loading: boolean;
}

/**
 * Reactive read/write access to a single preference stored in the RxDB
 * `settings` collection. The value re-renders live across the app and the
 * setter upserts (insert-or-patch) by key.
 */
export function useSetting<T extends string = string>(
  key: SettingKey,
  defaultValue: T | null = null,
): UseSettingResult<T> {
  const collection = useRxCollection<SettingDoc>('settings');

  // `useLiveRxQuery` treats `query` as a dependency by identity — a fresh
  // object literal each render leaks a live subscription per render and sends
  // the renderer into a feedback loop. Memoize it per key (see EmpresasCard).
  const query = useMemo<MangoQuery<SettingDoc>>(() => ({ selector: { key } }), [key]);

  const { results, loading } = useLiveRxQuery<SettingDoc>({
    collection: 'settings',
    query,
  });

  const stored = results[0]?.get('value') as T | undefined;
  const value = stored ?? defaultValue;

  const setValue = useCallback(
    async (next: T) => {
      if (!collection) return;
      await collection.upsert({ key, value: next, updatedAt: Date.now() });
    },
    [collection, key],
  );

  return { value, setValue, loading };
}
