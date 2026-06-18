import { useState } from 'react';
import { ProgressBar } from 'primereact/progressbar';
import { Button } from 'primereact/button';
import { useSync, type SyncJob } from '../../lib/syncContext';
import { formatCnpjCpf } from '../../lib/format';

const STATUS_META: Record<
  SyncJob['status'],
  { label: string; color: string }
> = {
  queued: { label: 'Na fila', color: 'var(--bnf-muted)' },
  running: { label: 'Sincronizando', color: 'var(--bnf-teal)' },
  done: { label: 'Concluído', color: 'var(--bnf-success-fg)' },
  error: { label: 'Erro', color: 'var(--bnf-error-fg)' },
  aborted: { label: 'Cancelado', color: 'var(--bnf-warn-fg)' },
};

function JobCard({ job }: { job: SyncJob }) {
  const { cancel, dismiss } = useSync();
  const [showErrors, setShowErrors] = useState(false);
  const meta = STATUS_META[job.status];
  const active = job.status === 'running' || job.status === 'queued';
  const c = job.counters;
  const title = job.razaoSocial || formatCnpjCpf(job.cnpj);

  return (
    <div
      style={{
        background: 'var(--bnf-surface)',
        border: '1px solid var(--bnf-line)',
        borderRadius: 'var(--bnf-radius-sm)',
        padding: '10px 12px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: meta.color,
            flex: '0 0 auto',
          }}
        />
        <strong
          style={{
            fontSize: 12.5,
            color: 'var(--bnf-ink)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flex: 1,
          }}
          title={title}
        >
          {title}
        </strong>
        <span style={{ fontSize: 10.5, color: meta.color, fontWeight: 700, textTransform: 'uppercase' }}>
          {meta.label}
          {job.fromZero ? ' · zero' : ''}
        </span>
      </div>

      <ProgressBar
        value={job.percent}
        showValue
        style={{ height: 14, fontSize: 9 }}
        color={job.status === 'error' ? 'var(--bnf-error-fg)' : 'var(--bnf-green)'}
      />

      <div style={{ fontSize: 11, color: 'var(--bnf-muted)', marginTop: 6, lineHeight: 1.5 }}>
        {active && <div style={{ color: 'var(--bnf-ink)' }}>{job.label}</div>}
        <span style={{ color: 'var(--bnf-success-fg)' }}>{c.inserted} nova(s)</span>
        {' · '}
        {c.duplicates} repetida(s)
        {c.semXml > 0 && ` · ${c.semXml} sem XML`}
        {c.failed > 0 && (
          <span style={{ color: 'var(--bnf-error-fg)' }}>{` · ${c.failed} erro(s)`}</span>
        )}
      </div>

      {job.summary && job.status !== 'running' && (
        <div
          style={{
            fontSize: 11,
            color:
              job.summary.severity === 'error'
                ? 'var(--bnf-error-fg)'
                : job.summary.severity === 'warn'
                  ? 'var(--bnf-warn-fg)'
                  : 'var(--bnf-success-fg)',
            marginTop: 4,
          }}
        >
          {job.summary.message}
        </div>
      )}

      {job.errors.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <button
            type="button"
            onClick={() => setShowErrors((v) => !v)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontSize: 10.5,
              color: 'var(--bnf-error-fg)',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            {showErrors ? 'Ocultar' : 'Ver'} {job.errors.length} erro(s)
          </button>
          {showErrors && (
            <ul style={{ margin: '4px 0 0', padding: '0 0 0 16px', fontSize: 10.5, color: 'var(--bnf-muted)' }}>
              {job.errors.slice(0, 10).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
        {active ? (
          <Button
            size="small"
            text
            severity="warning"
            icon="pi pi-stop"
            label="Parar"
            onClick={() => cancel(job.cnpj)}
            style={{ padding: '2px 8px', fontSize: 11 }}
          />
        ) : (
          <Button
            size="small"
            text
            icon="pi pi-times"
            label="Dispensar"
            onClick={() => dismiss(job.cnpj)}
            style={{ padding: '2px 8px', fontSize: 11 }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Fixed bottom-right sync HUD. Always on top (high z-index) so the user keeps
 * a live reference of progress, counts and errors while syncing — and can
 * resume a sync that was cut short by a tab close.
 */
export function SyncFloatingProgress() {
  const { jobs, interrupted, resume, clearFinished, cancelAll, isSyncing } = useSync();

  // Only surface interrupted empresas that don't already have a live job.
  const jobCnpjs = new Set(jobs.map((j) => j.cnpj));
  const pendingResume = interrupted.filter((e) => !jobCnpjs.has(e.cnpj));

  if (jobs.length === 0 && pendingResume.length === 0) return null;

  const hasFinished = jobs.some(
    (j) => j.status === 'done' || j.status === 'error' || j.status === 'aborted',
  );

  return (
    <div
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 99999,
        width: 340,
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: '78vh',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {pendingResume.map((e) => (
        <div
          key={e.cnpj}
          style={{
            background: 'var(--bnf-warn-bg)',
            border: '1px solid var(--bnf-warn-border)',
            borderRadius: 'var(--bnf-radius-sm)',
            padding: '10px 12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--bnf-warn-fg)', fontWeight: 700 }}>
            Sincronização interrompida
          </div>
          <div style={{ fontSize: 11, color: 'var(--bnf-ink)', margin: '3px 0 8px' }}>
            {e.razaoSocial || formatCnpjCpf(e.cnpj)} — parou no NSU {e.ultimoNSU}. Continuar de
            onde parou?
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <Button
              size="small"
              icon="pi pi-play"
              label="Continuar"
              onClick={() => resume({ cnpj: e.cnpj, razaoSocial: e.razaoSocial, cnpjConsulta: e.cnpjConsulta })}
              style={{ padding: '3px 10px', fontSize: 11 }}
            />
          </div>
        </div>
      ))}

      {jobs.map((job) => (
        <JobCard key={job.cnpj} job={job} />
      ))}

      {(hasFinished || isSyncing) && jobs.length > 1 && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          {isSyncing && (
            <Button
              size="small"
              text
              severity="warning"
              label="Parar tudo"
              onClick={cancelAll}
              style={{ padding: '2px 8px', fontSize: 11 }}
            />
          )}
          {hasFinished && (
            <Button
              size="small"
              text
              label="Limpar concluídos"
              onClick={clearFinished}
              style={{ padding: '2px 8px', fontSize: 11 }}
            />
          )}
        </div>
      )}
    </div>
  );
}
