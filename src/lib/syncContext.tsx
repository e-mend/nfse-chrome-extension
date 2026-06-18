import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRxCollection } from 'rxdb/plugins/react';
import { Toast } from 'primereact/toast';
import { useApi } from './useApi';
import { useXml } from './useXml';
import { useToast } from './useToast';
import {
  runSync,
  buildSyncSummary,
  type SyncCounters,
  type RunSyncResult,
} from './runSync';
import type { EmpresaCollection } from '../db';
import type { EmpresaDoc } from '../db/schemas/empresa';
import { deleteNotasByOwner, type NotaCollection } from '../db/schemas/nota';

export interface SyncTarget {
  cnpj: string;
  razaoSocial?: string;
  cnpjConsulta?: string;
}

export type SyncJobStatus = 'queued' | 'running' | 'done' | 'error' | 'aborted';

export interface SyncJob {
  cnpj: string;
  razaoSocial: string;
  cnpjConsulta: string;
  fromZero: boolean;
  status: SyncJobStatus;
  percent: number;
  label: string;
  counters: SyncCounters;
  errors: string[];
  summary?: { severity: 'success' | 'warn' | 'error'; message: string };
  startedAt: number;
  finishedAt?: number;
}

interface SyncContextValue {
  jobs: SyncJob[];
  isSyncing: boolean;
  activeCnpj: string | null;
  /** Empresas whose previous sync was cut short and can be resumed. */
  interrupted: EmpresaDoc[];
  /** Status of a given empresa's current/last job, if any. */
  jobFor: (cnpj: string) => SyncJob | undefined;
  /** Queue an incremental sync (only new docs since the stored cursor). */
  startSync: (target: SyncTarget) => void;
  /** Wipe the empresa's notas + reset the cursor, then sync from scratch. */
  resyncFromZero: (target: SyncTarget) => Promise<void>;
  /** Resume an interrupted sync (incremental, from the stored cursor). */
  resume: (target: SyncTarget) => void;
  cancel: (cnpj: string) => void;
  cancelAll: () => void;
  dismiss: (cnpj: string) => void;
  clearFinished: () => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

const emptyCounters = (): SyncCounters => ({
  inserted: 0,
  duplicates: 0,
  failed: 0,
  semXml: 0,
  seen: 0,
  batches: 0,
});

export function SyncProvider({ children }: { children: ReactNode }) {
  const notas = useRxCollection('notas') as NotaCollection | null;
  const empresas = useRxCollection<EmpresaDoc>('empresas') as EmpresaCollection | null;
  const { pingADN } = useApi();
  const { parseLote } = useXml();
  const { toastRef, showToast } = useToast();

  const [jobs, setJobs] = useState<Record<string, SyncJob>>({});
  const [activeCnpj, setActiveCnpj] = useState<string | null>(null);
  const [interrupted, setInterrupted] = useState<EmpresaDoc[]>([]);

  // Refs keep the queue processor free of stale closures while the component
  // re-renders on every progress tick.
  const jobsRef = useRef<Record<string, SyncJob>>({});
  const queueRef = useRef<string[]>([]);
  const abortRef = useRef<Map<string, AbortController>>(new Map());
  const processingRef = useRef(false);
  const pingRef = useRef(pingADN);
  const parseRef = useRef(parseLote);
  const notasRef = useRef(notas);
  const empresasRef = useRef(empresas);

  useEffect(() => { pingRef.current = pingADN; }, [pingADN]);
  useEffect(() => { parseRef.current = parseLote; }, [parseLote]);
  useEffect(() => { notasRef.current = notas; }, [notas]);
  useEffect(() => { empresasRef.current = empresas; }, [empresas]);

  const writeJobs = useCallback((next: Record<string, SyncJob>) => {
    jobsRef.current = next;
    setJobs(next);
  }, []);

  const patchJob = useCallback(
    (cnpj: string, patch: Partial<SyncJob>) => {
      const current = jobsRef.current[cnpj];
      if (!current) return;
      writeJobs({ ...jobsRef.current, [cnpj]: { ...current, ...patch } });
    },
    [writeJobs],
  );

  // Re-scan which empresas have an interrupted sync (breadcrumb left on a tab
  // close / crash). Lets the UI offer "Continuar" without re-downloading.
  const refreshInterrupted = useCallback(async () => {
    const coll = empresasRef.current;
    if (!coll) return;
    const docs = await coll.find({ selector: { syncInterrupted: true } }).exec();
    setInterrupted(docs.map((d) => d.toJSON() as EmpresaDoc));
  }, []);

  const pump = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      while (queueRef.current.length) {
        const cnpj = queueRef.current.shift();
        if (!cnpj) continue;
        const job = jobsRef.current[cnpj];
        if (!job || job.status === 'aborted') continue;

        const notasColl = notasRef.current;
        const empresasColl = empresasRef.current;
        if (!notasColl || !empresasColl) {
          patchJob(cnpj, {
            status: 'error',
            summary: { severity: 'error', message: 'Banco de dados indisponível.' },
            finishedAt: Date.now(),
          });
          continue;
        }

        const ctrl = new AbortController();
        abortRef.current.set(cnpj, ctrl);
        setActiveCnpj(cnpj);
        patchJob(cnpj, { status: 'running', label: 'Iniciando…' });

        let result: RunSyncResult;
        try {
          result = await runSync(
            {
              pingADN: pingRef.current,
              parseLote: parseRef.current,
              notas: notasColl,
              empresas: empresasColl,
            },
            {
              cnpj,
              razaoSocial: job.razaoSocial,
              cnpjConsulta: job.cnpjConsulta,
              fromZero: job.fromZero,
              signal: ctrl.signal,
              onProgress: (info) =>
                patchJob(cnpj, {
                  percent: info.percent,
                  label: info.label,
                  counters: info.counters,
                  errors: info.errors,
                }),
              onRetry: ({ tentativa, total, status, aguardarSeg }) =>
                patchJob(cnpj, {
                  label: `Servidor instável (HTTP ${status}) — tentando ${tentativa}/${total}, aguardando ${aguardarSeg}s…`,
                }),
            },
          );
        } catch (err) {
          patchJob(cnpj, {
            status: 'error',
            percent: 100,
            summary: {
              severity: 'error',
              message: err instanceof Error ? err.message : String(err),
            },
            finishedAt: Date.now(),
          });
          abortRef.current.delete(cnpj);
          continue;
        }

        abortRef.current.delete(cnpj);
        const summary = buildSyncSummary(result);
        const status: SyncJobStatus =
          result.stop === 'aborted'
            ? 'aborted'
            : summary.severity === 'error'
              ? 'error'
              : 'done';
        patchJob(cnpj, {
          status,
          percent: 100,
          counters: result.counters,
          errors: result.errors,
          summary,
          finishedAt: Date.now(),
        });
        showToast(summary.severity, `Sincronização — ${job.razaoSocial || cnpj}`, summary.message, 6000);
      }
    } finally {
      processingRef.current = false;
      setActiveCnpj(null);
      void refreshInterrupted();
    }
  }, [patchJob, showToast, refreshInterrupted]);

  const enqueue = useCallback(
    (target: SyncTarget, fromZero: boolean) => {
      const { cnpj } = target;
      if (!cnpj) return;
      const existing = jobsRef.current[cnpj];
      if (existing && (existing.status === 'queued' || existing.status === 'running')) {
        return; // already in flight
      }
      const job: SyncJob = {
        cnpj,
        razaoSocial: target.razaoSocial || existing?.razaoSocial || '',
        cnpjConsulta: target.cnpjConsulta || existing?.cnpjConsulta || '',
        fromZero,
        status: 'queued',
        percent: 0,
        label: 'Na fila…',
        counters: emptyCounters(),
        errors: [],
        startedAt: Date.now(),
        finishedAt: undefined,
        summary: undefined,
      };
      writeJobs({ ...jobsRef.current, [cnpj]: job });
      queueRef.current.push(cnpj);
      void pump();
    },
    [pump, writeJobs],
  );

  const startSync = useCallback((target: SyncTarget) => enqueue(target, false), [enqueue]);
  const resume = useCallback((target: SyncTarget) => enqueue(target, false), [enqueue]);

  const resyncFromZero = useCallback(
    async (target: SyncTarget) => {
      const { cnpj } = target;
      const notasColl = notasRef.current;
      const empresasColl = empresasRef.current;
      if (!cnpj || !notasColl || !empresasColl) return;
      // Wipe this company's notas and reset the cursor before re-walking.
      await deleteNotasByOwner(notasColl, cnpj);
      const doc = await empresasColl.findOne(cnpj).exec();
      if (doc) {
        await doc.patch({ ultimoNSU: 0, ultimaSync: null, updatedAt: Date.now() });
      }
      enqueue(target, true);
    },
    [enqueue],
  );

  const cancel = useCallback(
    (cnpj: string) => {
      const ctrl = abortRef.current.get(cnpj);
      if (ctrl) ctrl.abort();
      // Drop it from the queue if it hasn't started yet.
      queueRef.current = queueRef.current.filter((c) => c !== cnpj);
      const job = jobsRef.current[cnpj];
      if (job && job.status === 'queued') {
        patchJob(cnpj, { status: 'aborted', label: 'Cancelado.', finishedAt: Date.now() });
      }
    },
    [patchJob],
  );

  const cancelAll = useCallback(() => {
    queueRef.current = [];
    for (const ctrl of abortRef.current.values()) ctrl.abort();
    const next = { ...jobsRef.current };
    for (const cnpj of Object.keys(next)) {
      if (next[cnpj].status === 'queued') {
        next[cnpj] = { ...next[cnpj], status: 'aborted', label: 'Cancelado.', finishedAt: Date.now() };
      }
    }
    writeJobs(next);
  }, [writeJobs]);

  const dismiss = useCallback(
    (cnpj: string) => {
      const next = { ...jobsRef.current };
      delete next[cnpj];
      writeJobs(next);
    },
    [writeJobs],
  );

  const clearFinished = useCallback(() => {
    const next: Record<string, SyncJob> = {};
    for (const [cnpj, job] of Object.entries(jobsRef.current)) {
      if (job.status === 'queued' || job.status === 'running') next[cnpj] = job;
    }
    writeJobs(next);
  }, [writeJobs]);

  // Detect interrupted syncs once the empresas collection is ready.
  useEffect(() => {
    if (empresas) void refreshInterrupted();
  }, [empresas, refreshInterrupted]);

  const jobsList = useMemo(
    () => Object.values(jobs).sort((a, b) => a.startedAt - b.startedAt),
    [jobs],
  );
  const isSyncing = activeCnpj !== null || queueRef.current.length > 0;

  const jobFor = useCallback((cnpj: string) => jobs[cnpj], [jobs]);

  const value: SyncContextValue = {
    jobs: jobsList,
    isSyncing,
    activeCnpj,
    interrupted,
    jobFor,
    startSync,
    resyncFromZero,
    resume,
    cancel,
    cancelAll,
    dismiss,
    clearFinished,
  };

  return (
    <SyncContext.Provider value={value}>
      {children}
      <Toast ref={toastRef} position="bottom-left" />
    </SyncContext.Provider>
  );
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within a <SyncProvider>');
  return ctx;
}
