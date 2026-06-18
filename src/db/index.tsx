import { createRxDatabase, addRxPlugin, type RxDatabase, type RxCollection, type RxStorage } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';
import { RxDatabaseProvider } from 'rxdb/plugins/react';
import { useEffect, useState, type ReactNode } from 'react';

import { empresaSchema, empresaMigrationStrategies, type EmpresaDoc } from './schemas/empresa';
import { settingSchema, type SettingDoc } from './schemas/settings';
import { notaSchema, notaMigrationStrategies, type NotaDoc } from './schemas/nota';

// Required for schema version bumps (empresa v1, nota v1) — without it RxDB
// throws "You are using a function which must be overwritten by a plugin".
addRxPlugin(RxDBMigrationSchemaPlugin);

if (import.meta.env.DEV) {
  addRxPlugin(RxDBDevModePlugin);
}

// In DEV the dev-mode plugin requires a schema-validating storage wrapper
// (RxDB error DVM1). We MUST use z-schema here, not ajv / is-my-json-valid:
// those compile schemas via `new Function(...)` which Chrome blocks under the
// MV3 extension CSP (`unsafe-eval` is not allowed). z-schema is a pure
// interpreter and works under MV3.
//
// In production we strip the wrapper entirely so the validator (and z-schema
// itself) doesn't ship to users.
function buildStorage(): RxStorage<unknown, unknown> {
  const base = getRxStorageDexie();
  return import.meta.env.DEV
    ? wrappedValidateZSchemaStorage({ storage: base })
    : base;
}

export type EmpresaCollection = RxCollection<EmpresaDoc>;
export type SettingCollection = RxCollection<SettingDoc>;
export type NotaCollection = RxCollection<NotaDoc>;

export interface AppCollections {
  empresas: EmpresaCollection;
  settings: SettingCollection;
  notas: NotaCollection;
}

export type AppDatabase = RxDatabase<AppCollections>;

let dbPromise: Promise<AppDatabase> | null = null;

export function getDatabase(): Promise<AppDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    const db = await createRxDatabase<AppCollections>({
      name: 'baixarnfse',
      storage: buildStorage(),
      multiInstance: false,
      // `ignoreDuplicate` is only allowed when the dev-mode plugin is active
      // (RxDB error DB9). We mirror the same DEV gate used to register the plugin.
      ignoreDuplicate: import.meta.env.DEV,
    });

    await db.addCollections({
      empresas: {
        schema: empresaSchema,
        migrationStrategies: empresaMigrationStrategies,
      },
      settings: { schema: settingSchema },
      notas: {
        schema: notaSchema,
        migrationStrategies: notaMigrationStrategies,
      },
    });

    return db;
  })();

  return dbPromise;
}

/**
 * React provider that lazy-creates the RxDB instance on first render and
 * passes it to the official RxDB React provider. Children only mount once
 * the DB is ready so `useRxCollection` / `useRxQuery` never throw.
 */
export function DbProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<AppDatabase | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDatabase()
      .then((d) => { if (!cancelled) setDb(d); })
      .catch((err: unknown) => {
        console.error('[DB] failed to initialize RxDB', err);
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      });
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div style={{ padding: 24, color: '#991b1b' }}>
        Erro ao inicializar o banco de dados local: {error.message}
      </div>
    );
  }

  if (!db) {
    return (
      <div style={{ padding: 24, color: '#64748b' }}>
        Carregando banco de dados local…
      </div>
    );
  }

  return <RxDatabaseProvider database={db}>{children}</RxDatabaseProvider>;
}
