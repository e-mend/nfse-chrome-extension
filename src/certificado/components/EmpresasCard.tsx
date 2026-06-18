import { useMemo, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { InputNumber } from 'primereact/inputnumber';
import { useLiveRxQuery, useRxCollection } from 'rxdb/plugins/react';
import type { MangoQuery } from 'rxdb';
import type { EmpresaDoc } from '../../db/schemas/empresa';
import { formatCnpjCpf, formatDateTimeBR } from '../../lib/format';
import { useSync } from '../../lib/syncContext';

// IMPORTANT: keep this object identity stable across renders.
// `useLiveRxQuery` from rxdb/plugins/react treats `query` as a useCallback
// dependency and (incorrectly) returns its unsubscribe from inside an async
// function, so the cleanup never runs. Passing a fresh object literal on every
// render therefore leaks one live subscription per render and triggers a
// re-render feedback loop — eventually the renderer is killed (SIGILL).
const EMPRESAS_QUERY: MangoQuery<EmpresaDoc> = {
  selector: {},
  sort: [{ razaoSocial: 'asc' }],
};

/**
 * Card "Empresas e controle de NSU" — collapsible table of every empresa
 * connected so far. Backed by a live RxDB query so it re-renders on its own
 * whenever the logic layer writes a new ultimoNSU/ultimaSync.
 *
 * In single-cert-session mode the table is read-only-ish: editing the NSU
 * value updates the stored cursor (so the next sync resumes from there) but
 * it does NOT pre-select a cert.
 */
export function EmpresasCard() {
  const [open, setOpen] = useState(false);
  const collection = useRxCollection<EmpresaDoc>('empresas');
  const { startSync, resyncFromZero, jobFor } = useSync();

  const { results, loading, error } = useLiveRxQuery<EmpresaDoc>({
    collection: 'empresas',
    query: EMPRESAS_QUERY,
  });

  const rows = useMemo(() => results.map((r) => r.toJSON()), [results]);

  const onNsuChange = async (cnpj: string, value: number | null) => {
    if (!collection || value == null) return;
    const doc = await collection.findOne(cnpj).exec();
    if (!doc) return;
    await doc.patch({ ultimoNSU: value, updatedAt: Date.now() });
  };

  const onRemove = async (cnpj: string) => {
    if (!collection) return;
    const doc = await collection.findOne(cnpj).exec();
    if (doc) await doc.remove();
  };

  const onSync = (row: EmpresaDoc) =>
    startSync({ cnpj: row.cnpj, razaoSocial: row.razaoSocial, cnpjConsulta: row.cnpjConsulta });

  const onResyncZero = async (row: EmpresaDoc) => {
    const nome = row.razaoSocial || formatCnpjCpf(row.cnpj);
    const ok = window.confirm(
      `Ressincronizar do zero "${nome}"?\n\nIsso APAGA todas as notas já baixadas dessa empresa e baixa tudo de novo desde o NSU 0. Não dá pra desfazer.`,
    );
    if (!ok) return;
    await resyncFromZero({ cnpj: row.cnpj, razaoSocial: row.razaoSocial, cnpjConsulta: row.cnpjConsulta });
  };

  return (
    <section className="bnf-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="empresasCorpo"
        title="Mostrar/ocultar a lista de empresas"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          width: '100%',
          background: 'none',
          border: 'none',
          padding: '12px 0 4px',
          margin: 0,
          fontFamily: 'inherit',
          fontSize: 12,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--bnf-ink)',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            transition: 'transform 0.15s ease',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            color: 'var(--bnf-muted)',
            fontWeight: 900,
          }}
        >
          ▸
        </span>
        Empresas e controle de NSU
      </button>

      {open && (
        <div id="empresasCorpo" style={{ paddingTop: 4 }}>
          {error && (
            <p style={{ color: 'var(--bnf-error-fg)' }}>Erro ao carregar empresas: {error}</p>
          )}
          {loading && <p className="bnf-hint">Carregando…</p>}
          {!loading && rows.length === 0 && (
            <p style={{ color: 'var(--bnf-muted)', fontStyle: 'italic', margin: '4px 0 14px' }}>
              Nenhuma empresa ainda. Conecte um certificado acima — ou clique em{' '}
              <strong>Importar</strong> pra restaurar um backup.
            </p>
          )}
          {!loading && rows.length > 0 && (
            <>
              <DataTable
                value={rows}
                size="small"
                stripedRows
                dataKey="cnpj"
                emptyMessage="Nenhuma empresa."
                style={{ marginBottom: 8 }}
              >
                <Column
                  field="razaoSocial"
                  header="Empresa"
                  body={(row: EmpresaDoc) => (
                    <div className="bnf-empcol-nome" title={row.razaoSocial}>
                      {row.razaoSocial || '—'}
                    </div>
                  )}
                />
                <Column
                  field="cnpj"
                  header="CNPJ / CPF"
                  body={(row: EmpresaDoc) => (
                    <span className="bnf-empcol-cnpj">{formatCnpjCpf(row.cnpj)}</span>
                  )}
                />
                <Column
                  field="ultimoNSU"
                  header="Último NSU"
                  style={{ textAlign: 'right' }}
                  body={(row: EmpresaDoc) => (
                    <InputNumber
                      value={row.ultimoNSU}
                      onValueChange={(e) => onNsuChange(row.cnpj, e.value ?? null)}
                      min={0}
                      showButtons={false}
                      inputStyle={{ width: 80, padding: '2px 6px', textAlign: 'right' }}
                    />
                  )}
                />
                <Column
                  field="ultimaSync"
                  header="Última sincronização"
                  body={(row: EmpresaDoc) =>
                    row.ultimaSync ? formatDateTimeBR(row.ultimaSync) : '—'
                  }
                />
                <Column
                  header="Ações"
                  body={(row: EmpresaDoc) => {
                    const job = jobFor(row.cnpj);
                    const busy = job?.status === 'running' || job?.status === 'queued';
                    return (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                        <Button
                          size="small"
                          icon={busy ? 'pi pi-spin pi-spinner' : 'pi pi-sync'}
                          label={
                            busy
                              ? job?.status === 'queued'
                                ? 'Na fila'
                                : `${job?.percent ?? 0}%`
                              : 'Sincronizar'
                          }
                          disabled={busy}
                          onClick={() => onSync(row)}
                          title="Baixa só as notas novas desde a última sincronização."
                          style={{ padding: '3px 9px', fontSize: 11 }}
                        />
                        <Button
                          size="small"
                          outlined
                          severity="warning"
                          icon="pi pi-history"
                          disabled={busy}
                          onClick={() => onResyncZero(row)}
                          title="Apaga todas as notas dessa empresa e baixa tudo de novo desde o NSU 0."
                          style={{ padding: '3px 8px', fontSize: 11 }}
                        />
                        <Button
                          text
                          size="small"
                          severity="danger"
                          icon="pi pi-trash"
                          onClick={() => onRemove(row.cnpj)}
                          title="Remove a empresa da lista (não apaga as notas)."
                          style={{ padding: '3px 8px', fontSize: 11 }}
                        />
                      </div>
                    );
                  }}
                />
              </DataTable>
              <p className="bnf-hint">
                Dica: edite o <strong>NSU</strong> pra corrigir/reiniciar a sincronização; use o{' '}
                <strong>Backup</strong> (abaixo) pra levar o controle pra outro PC.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
