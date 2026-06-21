import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { IconField } from 'primereact/iconfield';
import { InputIcon } from 'primereact/inputicon';
import { Calendar } from 'primereact/calendar';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { MultiSelect } from 'primereact/multiselect';
import { ProgressBar } from 'primereact/progressbar';
import { Toast } from 'primereact/toast';
import { Tag } from 'primereact/tag';
import { useRxCollection } from 'rxdb/plugins/react';
import {
  buildNotaQuery,
  insertNotaIfNew,
  type NotaCollection,
  type NotaDoc,
  type NotaQueryOptions,
} from '../../db/schemas/nota';
import {
  buildNotaFileName,
  buildRangeSummaryMessage,
  MAX_NSU_RANGE_SPAN,
  useXml,
  type FetchNSURangeResult,
  type NfseTipoDocumento,
  type NSURangeProgress,
} from '../../lib/useXml';
import { useApi } from '../../lib/useApi';
import { formatBRL, formatCnpjCpf, formatDateTimeBR, localDateISO } from '../../lib/format';
import { useToast } from '../../lib/useToast';
import { defaultDanfseFilename, generateDanfsePdf } from '../../lib/danfse';
import { detectOwner } from '../../lib/detectOwner';
import type { EmpresaDoc } from '../../db/schemas/empresa';
import { SETTING_KEYS, useSetting } from '../../lib/useSettings';
import { buildFileName } from '../../lib/fileNaming';
import { buildXlsxBlob, type SheetColumn } from '../../lib/xlsx';

// ─── Column registry ────────────────────────────────────────────────────────
// Each entry drives both the <MultiSelect> picker (show/hide columns) and the
// list of <Column> rendered inside <DataTable>. Keep this list in one place so
// adding a new column is a single-line change.

interface ColumnDef {
  key: string;
  header: string;
  defaultVisible: boolean;
  sortField?: string;
  body: (row: NotaDoc) => React.ReactNode;
  style?: React.CSSProperties;
}

const TIPO_SEVERITY: Record<NfseTipoDocumento, 'success' | 'info' | 'warning' | 'danger'> = {
  NFSE: 'success',
  DPS: 'info',
  EVENTO: 'warning',
  DESCONHECIDO: 'danger',
};

const ALL_COLUMNS: ColumnDef[] = [
  {
    key: 'numeroNFSe',
    header: 'Número',
    defaultVisible: true,
    body: (r) => r.meta?.numeroNFSe || r.meta?.numeroDPS || '—',
  },
  {
    key: 'tipoDocumento',
    header: 'Tipo',
    defaultVisible: true,
    sortField: 'tipoDocumento',
    body: (r) => (
      <Tag value={r.tipoDocumento} severity={TIPO_SEVERITY[r.tipoDocumento] ?? 'info'} />
    ),
  },
  {
    // Which empresa/certificate this nota was saved under. The body is
    // overridden at render time to resolve the razão social from the empresas
    // collection (falls back to the formatted CNPJ when unknown).
    key: 'ownerDoc',
    header: 'Empresa (certificado)',
    defaultVisible: true,
    sortField: 'ownerDoc',
    body: (r) => formatCnpjCpf(r.ownerDoc) || '—',
  },
  {
    key: 'dataEmissaoISO',
    header: 'Emissão',
    defaultVisible: true,
    sortField: 'dataEmissaoISO',
    body: (r) => r.dataEmissaoISO || '—',
  },
  {
    key: 'competenciaMes',
    header: 'Competência',
    defaultVisible: false,
    sortField: 'competenciaMes',
    body: (r) => r.competenciaMes || '—',
  },
  {
    key: 'prestadorDoc',
    header: 'CNPJ Prestador',
    defaultVisible: true,
    body: (r) => formatCnpjCpf(r.prestadorDoc) || '—',
  },
  {
    key: 'prestadorNome',
    header: 'Prestador',
    defaultVisible: true,
    body: (r) => (
      <div className="bnf-empcol-nome" title={r.meta?.prestador?.nome ?? ''}>
        {r.meta?.prestador?.nome || '—'}
      </div>
    ),
  },
  {
    key: 'tomadorDoc',
    header: 'CNPJ Tomador',
    defaultVisible: false,
    body: (r) => formatCnpjCpf(r.tomadorDoc) || '—',
  },
  {
    key: 'tomadorNome',
    header: 'Tomador',
    defaultVisible: true,
    body: (r) => (
      <div className="bnf-empcol-nome" title={r.meta?.tomador?.nome ?? ''}>
        {r.meta?.tomador?.nome || '—'}
      </div>
    ),
  },
  {
    key: 'vServ',
    header: 'Valor',
    defaultVisible: true,
    body: (r) => formatBRL(r.meta?.vServ),
    style: { textAlign: 'right', whiteSpace: 'nowrap' },
  },
  {
    key: 'vISSQN',
    header: 'ISSQN',
    defaultVisible: false,
    body: (r) => formatBRL(r.meta?.vISSQN),
    style: { textAlign: 'right', whiteSpace: 'nowrap' },
  },
  {
    key: 'municipio',
    header: 'Município',
    defaultVisible: false,
    body: (r) => r.meta?.municipio || '—',
  },
  {
    key: 'chave',
    header: 'Chave',
    defaultVisible: false,
    sortField: 'chave',
    body: (r) => (
      <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11 }}>
        {r.chave}
      </span>
    ),
  },
  {
    key: 'nsu',
    header: 'NSU',
    defaultVisible: false,
    sortField: 'nsu',
    body: (r) => r.nsu,
    style: { textAlign: 'right' },
  },
  {
    key: 'createdAt',
    header: 'Salvo em',
    defaultVisible: false,
    sortField: 'createdAt',
    body: (r) => formatDateTimeBR(r.createdAt),
  },
];

const TIPO_OPTIONS: Array<{ label: string; value: NfseTipoDocumento | null }> = [
  { label: 'Todos os tipos', value: null },
  { label: 'NFSE', value: 'NFSE' },
  { label: 'DPS', value: 'DPS' },
  { label: 'EVENTO', value: 'EVENTO' },
  { label: 'DESCONHECIDO', value: 'DESCONHECIDO' },
];

const LIMIT_OPTIONS = [50, 100, 250, 500, 1000, 5000];
const ROWS_PER_PAGE_OPTIONS = [10, 25, 50, 100];

// ─── Filter state ───────────────────────────────────────────────────────────

interface NotaFilters {
  search: string;
  tipoDocumento: NfseTipoDocumento | null;
  /** Digits-only CNPJ/CPF of the empresa/certificate to filter by. */
  ownerDoc: string | null;
  /** Inclusive lower bound on `dataEmissaoISO`. */
  dateFrom: Date | null;
  /** Inclusive upper bound on `dataEmissaoISO`. */
  dateTo: Date | null;
  limit: number;
}

const DEFAULT_FILTERS: NotaFilters = {
  search: '',
  tipoDocumento: null,
  ownerDoc: null,
  dateFrom: null,
  dateTo: null,
  limit: 500,
};

interface CompanyOption {
  label: string;
  value: string;
}

interface CompanyOptionGroup {
  label: string;
  items: CompanyOption[];
}

// ─── Downloads ──────────────────────────────────────────────────────────────
// Files are saved through the browser's standard download flow: a synthetic
// anchor click with the `download` attribute. This works in extension pages
// (and `vite preview`) WITHOUT the "downloads" permission — we intentionally
// don't use `chrome.downloads` so the manifest can stay least-privilege.

function safeFilename(name: string, ext: string): string {
  const base = (name || 'nota').replace(/[\/\\:*?"<>|]+/g, '_');
  return base.toLowerCase().endsWith(`.${ext}`) ? base : `${base}.${ext}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the browser has had a chance to fetch the blob: URL — too
  // early and the download is cancelled.
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

function downloadXml(nota: NotaDoc) {
  const blob = new Blob([nota.xml], { type: 'application/xml' });
  downloadBlob(blob, safeFilename(nota.name || nota.chave, 'xml'));
}

/**
 * Build and download the DANFSe PDF for one nota. Wraps `generateDanfsePdf`
 * (parser + pdf-lib layout per NT-008 v1.0) plus the same anchor-click
 * download used for XML downloads.
 *
 * Returns the generated bytes so a bulk caller can throw on the first failure
 * without re-parsing.
 */
async function downloadPdf(nota: NotaDoc, pattern?: string | null): Promise<Uint8Array> {
  const { bytes, data } = await generateDanfsePdf(nota.xml);
  // pdf-lib returns a Uint8Array; wrap it in a Blob for the download. The
  // BlobPart conversion sidesteps a SharedArrayBuffer issue some pdf-lib
  // builds emit on Chrome 121+ (`Uint8Array<ArrayBufferLike>`).
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
  // When the user configured a naming pattern, build the filename from the
  // nota's parsed meta. Otherwise fall back to the legacy behavior (reuse the
  // XML's stored name, then the danfse default).
  let filename: string;
  if (pattern) {
    const baseName = nota.name?.replace(/\.xml$/i, '') || defaultDanfseFilename(data).replace(/\.pdf$/i, '');
    filename = buildFileName(pattern, nota.meta, nota.nsu, 'pdf', baseName);
  } else {
    const baseName = nota.name?.replace(/\.xml$/i, '') ?? '';
    filename = baseName ? safeFilename(baseName, 'pdf') : defaultDanfseFilename(data);
  }
  downloadBlob(blob, filename);
  return bytes;
}

// ─── Excel export ───────────────────────────────────────────────────────────
// Flatten a nota (plus its parsed `meta`) into a spreadsheet row. Money fields
// stay numeric so the user can sum/filter them in Excel; identifiers and names
// are plain text. The "Empresa (certificado)" column is resolved through the
// live empresas list, hence the `ownerName` resolver passed in from the
// component.

/** "YYYY-MM-DD" → "DD/MM/AAAA" (leaves anything else untouched). */
function isoToBR(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function buildNotaExcelColumns(ownerName: (doc: string) => string): SheetColumn<NotaDoc>[] {
  return [
    { header: 'Tipo', width: 12, value: (r) => r.tipoDocumento },
    { header: 'Número', width: 14, value: (r) => r.meta?.numeroNFSe || r.meta?.numeroDPS || '' },
    { header: 'Série', width: 10, value: (r) => r.meta?.serie || '' },
    { header: 'Emissão', width: 12, value: (r) => isoToBR(r.dataEmissaoISO) },
    { header: 'Competência', width: 12, value: (r) => r.competenciaMes || '' },
    { header: 'Empresa (certificado)', width: 32, value: (r) => ownerName(r.ownerDoc) },
    { header: 'CNPJ Prestador', width: 20, value: (r) => formatCnpjCpf(r.prestadorDoc) },
    { header: 'Prestador', width: 36, value: (r) => r.meta?.prestador?.nome || '' },
    { header: 'CNPJ Tomador', width: 20, value: (r) => formatCnpjCpf(r.tomadorDoc) },
    { header: 'Tomador', width: 36, value: (r) => r.meta?.tomador?.nome || '' },
    { header: 'Município', width: 24, value: (r) => r.meta?.municipio || r.meta?.xLocPrestacao || '' },
    { header: 'Descrição do serviço', width: 48, value: (r) => r.meta?.descricaoServico || '' },
    { header: 'Cód. Trib. Nacional', width: 14, value: (r) => r.meta?.cTribNac || '' },
    { header: 'Valor do serviço', width: 16, type: 'money', value: (r) => r.meta?.vServ },
    { header: 'Base de cálculo ISSQN', width: 16, type: 'money', value: (r) => r.meta?.vBC },
    { header: 'Alíquota (%)', width: 12, type: 'number', value: (r) => r.meta?.pAliqAplic },
    { header: 'ISSQN', width: 14, type: 'money', value: (r) => r.meta?.vISSQN },
    { header: 'Total retenções', width: 16, type: 'money', value: (r) => r.meta?.vTotalRet },
    { header: 'Valor líquido', width: 16, type: 'money', value: (r) => r.meta?.vLiq },
    { header: 'Chave', width: 46, value: (r) => r.chave },
    { header: 'NSU', width: 10, type: 'number', value: (r) => r.nsu },
    { header: 'Salvo em', width: 18, value: (r) => formatDateTimeBR(r.createdAt) },
  ];
}

// ─── Component ──────────────────────────────────────────────────────────────

// ─── NSU range download ─────────────────────────────────────────────────────
// State for the "Baixar faixa NSU" dialog. Kept in its own block (and split
// out of `useState` calls into a single object) so the inputs don't grow into
// a thicket of independent useState hooks.

interface RangeFormState {
  open: boolean;
  de: number | null;
  ate: number | null;
  /** True while the loop is running — disables the form & shows progress. */
  busy: boolean;
  /** Whether to also save each XML to disk (mirrors legacy behavior). */
  alsoSaveToDisk: boolean;
  progress: NSURangeProgress | null;
  /** Last result, kept so we can show a concise summary inside the dialog. */
  lastResult: { result: FetchNSURangeResult; inserted: number; duplicates: number } | null;
}

const DEFAULT_RANGE_FORM: RangeFormState = {
  open: false,
  de: null,
  ate: null,
  busy: false,
  alsoSaveToDisk: false,
  progress: null,
  lastResult: null,
};

// ─── Range download dialog (subcomponent) ──────────────────────────────────
// Pulled out of the main render so the JSX of `NotasTable` stays focused on
// the table itself. Receives the parent state + submit/cancel handlers.

interface RangeDownloadDialogProps {
  state: RangeFormState;
  setState: React.Dispatch<React.SetStateAction<RangeFormState>>;
  onSubmit: () => void;
  onCancel: () => void;
  onClose: () => void;
}

function RangeDownloadDialog({
  state,
  setState,
  onSubmit,
  onCancel,
  onClose,
}: RangeDownloadDialogProps) {
  const span =
    state.de != null && state.ate != null && state.ate >= state.de
      ? state.ate - state.de + 1
      : null;
  const tooLarge = span != null && span - 1 > MAX_NSU_RANGE_SPAN;
  const canSubmit = !state.busy && state.de != null && !tooLarge;

  const result = state.lastResult?.result ?? null;
  const summary = result ? buildRangeSummaryMessage(result) : null;

  return (
    <Dialog
      header="Baixar faixa de NSU"
      visible={state.open}
      onHide={onClose}
      modal
      dismissableMask={!state.busy}
      closable={!state.busy}
      style={{ width: 'min(560px, 95vw)' }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          {state.busy ? (
            <Button
              label="Parar"
              icon="pi pi-stop"
              severity="warning"
              outlined
              onClick={onCancel}
            />
          ) : (
            <>
              <Button label="Fechar" icon="pi pi-times" text onClick={onClose} />
              <Button
                label="Baixar"
                icon="pi pi-cloud-download"
                disabled={!canSubmit}
                onClick={onSubmit}
              />
            </>
          )}
        </div>
      }
    >
      <p style={{ margin: '0 0 12px', color: 'var(--bnf-muted)', fontSize: 12 }}>
        Re-busca um intervalo de NSU diretamente no ADN. Os XMLs encontrados são
        salvos no banco local e aparecem nesta tabela. Ideal para preencher
        lacunas detectadas em sincronizações anteriores.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label htmlFor="rangeDe" className="bnf-lbl">
            De
          </label>
          <InputNumber
            inputId="rangeDe"
            value={state.de}
            onValueChange={(e) =>
              setState((prev) => ({ ...prev, de: typeof e.value === 'number' ? e.value : null }))
            }
            min={1}
            useGrouping={false}
            placeholder="1"
            disabled={state.busy}
            inputStyle={{ width: '100%' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label htmlFor="rangeAte" className="bnf-lbl">
            Até <span style={{ color: 'var(--bnf-muted)', fontWeight: 'normal' }}>(opcional)</span>
          </label>
          <InputNumber
            inputId="rangeAte"
            value={state.ate}
            onValueChange={(e) =>
              setState((prev) => ({ ...prev, ate: typeof e.value === 'number' ? e.value : null }))
            }
            min={state.de ?? 1}
            useGrouping={false}
            placeholder="igual ao De"
            disabled={state.busy}
            inputStyle={{ width: '100%' }}
          />
        </div>
      </div>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          marginBottom: 12,
          cursor: state.busy ? 'not-allowed' : 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={state.alsoSaveToDisk}
          onChange={(e) =>
            setState((prev) => ({ ...prev, alsoSaveToDisk: e.target.checked }))
          }
          disabled={state.busy}
        />
        Também salvar cada XML em disco (downloads do navegador).
      </label>

      {tooLarge && (
        <p style={{ color: 'var(--bnf-error-fg)', fontSize: 12, margin: '0 0 12px' }}>
          Faixa muito grande — máximo {MAX_NSU_RANGE_SPAN} NSUs por vez.
        </p>
      )}

      {state.busy && (
        <div style={{ marginTop: 8 }}>
          <ProgressBar
            mode={state.progress ? 'determinate' : 'indeterminate'}
            value={state.progress ? Math.round(state.progress.ratio * 100) : 0}
            style={{ height: 8 }}
          />
          {state.progress && (
            <p
              style={{
                margin: '6px 0 0',
                fontSize: 11.5,
                color: 'var(--bnf-muted)',
              }}
            >
              NSU atual: {state.progress.cursor} · {state.progress.parsed} XML(s) · {state.progress.semXml} sem
              XML · {state.progress.achados} achado(s)
            </p>
          )}
        </div>
      )}

      {!state.busy && summary && (
        <div
          style={{
            marginTop: 8,
            padding: '8px 10px',
            border: '1px solid var(--bnf-line)',
            borderRadius: 6,
            background: 'var(--bnf-card-bg, transparent)',
            fontSize: 12,
          }}
        >
          <strong>Resultado:</strong> {summary}
          {state.lastResult && (
            <div style={{ marginTop: 4, color: 'var(--bnf-muted)' }}>
              {state.lastResult.inserted} nova(s) inserida(s) ·{' '}
              {state.lastResult.duplicates} já existiam.
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function NotasTable() {
  const collection = useRxCollection<NotaDoc>('notas') as NotaCollection | null;
  const empresasCollection = useRxCollection<EmpresaDoc>('empresas');
  const { toastRef, showToast } = useToast();
  const { pingADN } = useApi();
  const { fetchNSURange } = useXml();
  // Naming pattern for the downloaded DANFSe PDF (set in the Configurações tab).
  const { value: pdfNamePattern } = useSetting(SETTING_KEYS.pdfNamePattern);

  // Live list of empresas → powers the company filter dropdown and resolves the
  // "Empresa (certificado)" column to a readable razão social.
  const [empresas, setEmpresas] = useState<EmpresaDoc[]>([]);
  useEffect(() => {
    if (!empresasCollection) return;
    const sub = empresasCollection
      .find({ selector: {}, sort: [{ razaoSocial: 'asc' }] })
      .$.subscribe((docs) => setEmpresas(docs.map((d) => d.toJSON() as EmpresaDoc)));
    return () => sub.unsubscribe();
  }, [empresasCollection]);

  const empresaNameByDoc = useMemo(() => {
    const map: Record<string, string> = {};
    for (const e of empresas) map[e.cnpj] = e.razaoSocial;
    return map;
  }, [empresas]);

  const ownerName = useCallback(
    (doc: string) => {
      if (!doc) return '—';
      return empresaNameByDoc[doc] || formatCnpjCpf(doc) || doc;
    },
    [empresaNameByDoc],
  );

  // Grouped options (CNPJ vs CPF) for the company <Dropdown>.
  const companyOptionGroups = useMemo<CompanyOptionGroup[]>(() => {
    const toOption = (e: EmpresaDoc): CompanyOption => ({
      label: `${e.razaoSocial || formatCnpjCpf(e.cnpj)} · ${formatCnpjCpf(e.cnpj)}`,
      value: e.cnpj,
    });
    const cnpj = empresas.filter((e) => e.cnpj.length === 14).map(toOption);
    const cpf = empresas.filter((e) => e.cnpj.length !== 14).map(toOption);
    const groups: CompanyOptionGroup[] = [];
    if (cnpj.length) groups.push({ label: 'Empresas (CNPJ)', items: cnpj });
    if (cpf.length) groups.push({ label: 'Pessoas (CPF)', items: cpf });
    return groups;
  }, [empresas]);

  const [filters, setFilters] = useState<NotaFilters>(DEFAULT_FILTERS);
  // Debounced copy of the free-text query so we don't re-run the Mango query
  // on every keystroke (each query change tears down + recreates the live
  // subscription).
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [rows, setRows] = useState<NotaDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<NotaDoc[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<ColumnDef[]>(
    ALL_COLUMNS.filter((c) => c.defaultVisible),
  );
  const [bulkBusy, setBulkBusy] = useState(false);

  const [rangeForm, setRangeForm] = useState<RangeFormState>(DEFAULT_RANGE_FORM);
  // AbortController for the in-flight range fetch so the user can cancel
  // mid-flight without leaving the loop running on the ADN.
  const rangeAbortRef = useRef<AbortController | null>(null);

  // ── Debounce the search input ───────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search.trim()), 300);
    return () => clearTimeout(t);
  }, [filters.search]);

  // ── Build a Mango query whose identity is stable across renders when
  //    the filter values themselves don't change. Required by RxDB live
  //    subscriptions (see EmpresasCard for the leak we're avoiding).
  const queryOptions = useMemo<NotaQueryOptions>(() => {
    // Normalize the [De, Até] BETWEEN bounds: swap them when the user typed
    // an inverted range so the Mango query never produces an empty result by
    // accident (e.g. picked "Até" first, then "De").
    let from = filters.dateFrom;
    let to = filters.dateTo;
    if (from && to && from.getTime() > to.getTime()) {
      [from, to] = [to, from];
    }
    return {
      search: debouncedSearch || undefined,
      tipoDocumento: filters.tipoDocumento ?? undefined,
      ownerDoc: filters.ownerDoc ?? undefined,
      dataFromISO: from ? localDateISO(from) : undefined,
      dataToISO: to ? localDateISO(to) : undefined,
      pageSize: filters.limit > 0 ? filters.limit : undefined,
    };
  }, [debouncedSearch, filters.tipoDocumento, filters.ownerDoc, filters.dateFrom, filters.dateTo, filters.limit]);

  // ── Live subscription. We use the raw RxDB observable (not
  //    `useLiveRxQuery`) because that hook leaks when the query object
  //    changes — see the EmpresasCard comment for the full story.
  const subRef = useRef<{ unsubscribe: () => void } | null>(null);
  useEffect(() => {
    if (!collection) return;
    setLoading(true);
    setError(null);

    const query = collection.find(buildNotaQuery(queryOptions));
    subRef.current?.unsubscribe();
    subRef.current = query.$.subscribe({
      next: (docs) => {
        setRows(docs.map((d) => d.toJSON() as NotaDoc));
        setLoading(false);
      },
      error: (err: unknown) => {
        console.error('[Notas] live query failed', err);
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      },
    });

    return () => {
      subRef.current?.unsubscribe();
      subRef.current = null;
    };
  }, [collection, queryOptions]);

  // ── Actions ────────────────────────────────────────────────────────────

  const onDownloadXml = (nota: NotaDoc) => {
    try {
      downloadXml(nota);
      showToast('success', 'XML baixado', nota.name || nota.chave, 2500);
    } catch (err) {
      console.error('[Notas] downloadXml failed', err);
      showToast('error', 'Erro ao baixar XML', String(err));
    }
  };

  const onDownloadPdf = async (nota: NotaDoc) => {
    if (nota.tipoDocumento !== 'NFSE') {
      showToast(
        'warn',
        'DANFSe disponível apenas para NFS-e',
        'Eventos e DPS não têm DANFSe — só notas autorizadas geram PDF.',
      );
      return;
    }
    try {
      await downloadPdf(nota, pdfNamePattern);
      showToast('success', 'DANFSe gerado', nota.meta?.numeroNFSe || nota.chave, 2500);
    } catch (err) {
      console.error('[Notas] downloadPdf failed', err);
      showToast(
        'error',
        'Erro ao gerar DANFSe',
        err instanceof Error ? err.message : String(err),
      );
    }
  };

  const onBulkXml = async () => {
    if (selection.length === 0) return;
    setBulkBusy(true);
    try {
      // Stagger downloads to avoid Chrome merging blob URL fetches and to
      // give the user a chance to react if a "save as" dialog appears.
      for (const n of selection) {
        downloadXml(n);
        await new Promise((r) => setTimeout(r, 120));
      }
      showToast(
        'success',
        `${selection.length} XML enviados ao download`,
        'Veja a barra de downloads do navegador.',
      );
    } catch (err) {
      console.error('[Notas] bulk XML failed', err);
      showToast('error', 'Erro ao baixar XMLs', String(err));
    } finally {
      setBulkBusy(false);
    }
  };

  const onBulkPdf = async () => {
    if (selection.length === 0) return;
    setBulkBusy(true);
    let generated = 0;
    let skipped = 0;
    let failed = 0;
    try {
      for (const nota of selection) {
        if (nota.tipoDocumento !== 'NFSE') {
          skipped += 1;
          continue;
        }
        try {
          await downloadPdf(nota, pdfNamePattern);
          generated += 1;
          // Stagger to avoid Chrome batching/cancelling identical-mime downloads.
          await new Promise((r) => setTimeout(r, 120));
        } catch (err) {
          failed += 1;
          console.warn('[Notas] downloadPdf failed for', nota.chave, err);
        }
      }
      const detail =
        `${generated} gerado(s)` +
        (skipped ? ` · ${skipped} ignorado(s) (não-NFSE)` : '') +
        (failed ? ` · ${failed} com erro` : '');
      const tone = failed > 0 ? 'warn' : 'success';
      showToast(tone, 'DANFSe em lote', detail);
    } finally {
      setBulkBusy(false);
    }
  };

  // Export to Excel. Uses the current selection when there is one, otherwise
  // every row matching the active filters. The file mirrors the columns of the
  // table (plus a few extra meta fields) with money kept numeric so it can be
  // summed straight away in Excel.
  const onExportExcel = () => {
    const data = selection.length > 0 ? selection : rows;
    if (data.length === 0) {
      showToast('warn', 'Nada para exportar', 'Nenhuma nota nos filtros atuais.');
      return;
    }
    try {
      const blob = buildXlsxBlob({
        sheetName: 'Notas',
        columns: buildNotaExcelColumns(ownerName),
        rows: data,
      });
      const stamp = localDateISO(new Date());
      downloadBlob(blob, safeFilename(`notas_${stamp}`, 'xlsx'));
      showToast('success', 'Excel gerado', `${data.length} nota(s) exportada(s).`, 3000);
    } catch (err) {
      console.error('[Notas] export Excel failed', err);
      showToast('error', 'Erro ao gerar Excel', err instanceof Error ? err.message : String(err));
    }
  };

  const onResetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setSelection([]);
  };

  // ── Range download (Baixar faixa NSU) ──────────────────────────────────
  // Compose `useApi.pingADN` + `useXml.fetchNSURange` + RxDB `insertNotaIfNew`
  // and let the user trigger it from the toolbar. The legacy `baixarFaixaNSU`
  // wrote files directly to disk via the File System Access API — here we
  // persist to RxDB (so the rows show up in this very table) and offer an
  // optional "também salvar em disco" toggle for those who want files on the
  // spot.

  const openRangeDialog = useCallback(() => {
    setRangeForm({ ...DEFAULT_RANGE_FORM, open: true });
  }, []);

  const closeRangeDialog = useCallback(() => {
    if (rangeAbortRef.current) rangeAbortRef.current.abort();
    rangeAbortRef.current = null;
    setRangeForm({ ...DEFAULT_RANGE_FORM, open: false });
  }, []);

  const cancelRangeFetch = useCallback(() => {
    rangeAbortRef.current?.abort();
  }, []);

  const persistRangeItems = useCallback(
    async (
      result: FetchNSURangeResult,
      alsoSaveToDisk: boolean,
    ): Promise<{ inserted: number; duplicates: number; failed: number }> => {
      if (!collection) return { inserted: 0, duplicates: 0, failed: result.items.length };
      let inserted = 0;
      let duplicates = 0;
      let failed = 0;
      // The range tool isn't tied to a chosen empresa, so infer the mailbox
      // owner from the batch (same heuristic used right after Conectar). If a
      // company filter is active, prefer it — the user is clearly working that
      // mailbox.
      const detected = detectOwner(result.items.map((it) => it.meta));
      const ownerDoc = filters.ownerDoc || detected?.owner.doc || '';
      for (const item of result.items) {
        const filename = buildNotaFileName(item.meta, item.nsu);
        try {
          const res = await insertNotaIfNew(collection, {
            meta: item.meta,
            nsu: item.nsu,
            xml: item.xml,
            name: filename,
            ownerDoc,
          });
          if (res.inserted) inserted += 1;
          else duplicates += 1;
        } catch (err) {
          failed += 1;
          console.warn('[Notas] insertNotaIfNew failed', err);
        }
        if (alsoSaveToDisk) {
          try {
            const blob = new Blob([item.xml], { type: 'application/xml' });
            downloadBlob(blob, safeFilename(filename, 'xml'));
            // Stagger to avoid the browser collapsing identical-mime downloads.
            await new Promise((r) => setTimeout(r, 80));
          } catch (err) {
            console.warn('[Notas] disk save failed', err);
          }
        }
      }
      return { inserted, duplicates, failed };
    },
    [collection, filters.ownerDoc],
  );

  const onRangeSubmit = useCallback(async () => {
    const de = rangeForm.de;
    const ate = rangeForm.ate ?? de;
    if (!collection) {
      showToast('error', 'Banco indisponível', 'A coleção `notas` ainda não está pronta.');
      return;
    }
    if (de == null) {
      showToast('warn', 'Informe o NSU "De"', 'Digite o número inicial da faixa.');
      return;
    }

    const ctrl = new AbortController();
    rangeAbortRef.current = ctrl;
    setRangeForm((prev) => ({ ...prev, busy: true, progress: null, lastResult: null }));

    try {
      const result = await fetchNSURange({
        de,
        ate: ate ?? de,
        pingADN,
        signal: ctrl.signal,
        onProgress: (info) =>
          setRangeForm((prev) => (prev.busy ? { ...prev, progress: info } : prev)),
        onRetry: ({ tentativa, total, status }) => {
          showToast(
            'warn',
            `Tentando de novo (${tentativa}/${total})…`,
            `Servidor retornou HTTP ${status}.`,
            2500,
          );
        },
      });

      const persisted = await persistRangeItems(result, rangeForm.alsoSaveToDisk);
      const tone =
        result.stop === 'error'
          ? 'error'
          : result.stop === 'aborted' || result.semXml > 0 || result.buracos.length > 0
            ? 'warn'
            : 'success';
      const summary = buildRangeSummaryMessage(result);
      const detail =
        `${persisted.inserted} nova(s) salva(s) · ${persisted.duplicates} já existiam` +
        (persisted.failed ? ` · ${persisted.failed} com erro` : '');
      showToast(tone, summary, detail, 6000);

      setRangeForm((prev) => ({
        ...prev,
        busy: false,
        lastResult: { result, inserted: persisted.inserted, duplicates: persisted.duplicates },
      }));
    } catch (err) {
      console.error('[Notas] fetchNSURange failed', err);
      showToast(
        'error',
        'Erro ao baixar a faixa',
        err instanceof Error ? err.message : String(err),
      );
      setRangeForm((prev) => ({ ...prev, busy: false }));
    } finally {
      rangeAbortRef.current = null;
    }
  }, [
    collection,
    fetchNSURange,
    pingADN,
    persistRangeItems,
    rangeForm.alsoSaveToDisk,
    rangeForm.ate,
    rangeForm.de,
    showToast,
  ]);

  // Stop the in-flight loop on unmount so a closed tab doesn't keep firing
  // ADN requests.
  useEffect(() => () => rangeAbortRef.current?.abort(), []);

  // ── Render ─────────────────────────────────────────────────────────────

  const actionsBody = (row: NotaDoc) => (
    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
      <Button
        rounded
        text
        size="small"
        icon="pi pi-file"
        aria-label="Baixar XML"
        tooltip="Baixar XML"
        tooltipOptions={{ position: 'top' }}
        onClick={() => onDownloadXml(row)}
      />
      <Button
        rounded
        text
        size="small"
        icon="pi pi-file-pdf"
        aria-label="Baixar PDF (DANFSe)"
        tooltip="Baixar PDF (DANFSe)"
        tooltipOptions={{ position: 'top' }}
        onClick={() => onDownloadPdf(row)}
      />
    </div>
  );

  return (
    <section className="bnf-card" style={{ padding: '12px 16px 16px' }}>
      <Toast ref={toastRef} />

      <h2 style={{ margin: '4px 0 12px' }}>Notas salvas</h2>

      {/* Filters ------------------------------------------------------- */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label htmlFor="notasSearch" className="bnf-lbl">
            Buscar (LIKE)
          </label>
          <IconField iconPosition="left" style={{ display: 'block', width: '100%' }}>
            <InputIcon className="pi pi-search" />
            <InputText
              id="notasSearch"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="empresa, CNPJ, chave, número…"
              style={{ width: '100%' }}
            />
          </IconField>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, gridColumn: 'span 2', minWidth: 0 }}>
          <label className="bnf-lbl">Emissão entre</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calendar
              inputId="notasDateFrom"
              value={filters.dateFrom}
              onChange={(e) =>
                setFilters((f) => ({ ...f, dateFrom: (e.value as Date | null) ?? null }))
              }
              // Capping `maxDate` at `dateTo` prevents the user from picking
              // a "De" greater than the already-chosen "Até" — keeps the
              // BETWEEN range valid without us having to silently swap.
              maxDate={filters.dateTo ?? undefined}
              showButtonBar
              showIcon
              dateFormat="dd/mm/yy"
              placeholder="De"
              style={{ flex: 1, minWidth: 0 }}
              inputStyle={{ width: '100%' }}
            />
            <span style={{ color: 'var(--bnf-muted)', fontSize: 11 }}>até</span>
            <Calendar
              inputId="notasDateTo"
              value={filters.dateTo}
              onChange={(e) =>
                setFilters((f) => ({ ...f, dateTo: (e.value as Date | null) ?? null }))
              }
              minDate={filters.dateFrom ?? undefined}
              showButtonBar
              showIcon
              dateFormat="dd/mm/yy"
              placeholder="Até"
              style={{ flex: 1, minWidth: 0 }}
              inputStyle={{ width: '100%' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label htmlFor="notasTipo" className="bnf-lbl">
            Tipo
          </label>
          <Dropdown
            inputId="notasTipo"
            value={filters.tipoDocumento}
            options={TIPO_OPTIONS}
            onChange={(e) =>
              setFilters((f) => ({ ...f, tipoDocumento: e.value as NfseTipoDocumento | null }))
            }
            showClear
            placeholder="Todos os tipos"
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <label htmlFor="notasEmpresa" className="bnf-lbl">
            Empresa (certificado)
          </label>
          <Dropdown
            inputId="notasEmpresa"
            value={filters.ownerDoc}
            options={companyOptionGroups}
            optionGroupLabel="label"
            optionGroupChildren="items"
            optionLabel="label"
            optionValue="value"
            onChange={(e) =>
              setFilters((f) => ({ ...f, ownerDoc: (e.value as string | null) ?? null }))
            }
            filter
            showClear
            placeholder="Todas as empresas"
            emptyMessage="Nenhuma empresa ainda"
            emptyFilterMessage="Nenhuma empresa encontrada"
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <label htmlFor="notasLimit" className="bnf-lbl">
            Limite
          </label>
          <InputNumber
            inputId="notasLimit"
            value={filters.limit}
            onValueChange={(e) =>
              setFilters((f) => ({ ...f, limit: typeof e.value === 'number' ? e.value : 0 }))
            }
            min={0}
            max={100000}
            showButtons
            buttonLayout="horizontal"
            decrementButtonIcon="pi pi-minus"
            incrementButtonIcon="pi pi-plus"
            suffix=" linhas"
            // The "Limite" caps the number of rows fetched from RxDB — useful
            // when the local store grows to tens of thousands of notas. Click
            // the up/down arrows or use one of the suggested values below.
            // `width: 100%` on the wrapper + `minWidth: 0` on the inner input
            // are needed because `.p-inputnumber` is `inline-flex` and the
            // `suffix=" linhas"` text gives the field an intrinsic width that
            // otherwise overflows the narrow grid column.
            style={{ width: '100%' }}
            inputStyle={{ width: '100%', minWidth: 0 }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
            {LIMIT_OPTIONS.map((n) => (
              <Button
                key={n}
                size="small"
                text
                label={String(n)}
                onClick={() => setFilters((f) => ({ ...f, limit: n }))}
                style={{ padding: '0 6px', fontSize: 11 }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Toolbar ------------------------------------------------------- */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
          paddingBottom: 8,
          borderBottom: '1px solid var(--bnf-line)',
        }}
      >
        <MultiSelect
          value={visibleColumns}
          options={ALL_COLUMNS}
          optionLabel="header"
          onChange={(e) => setVisibleColumns(e.value as ColumnDef[])}
          display="chip"
          placeholder="Colunas visíveis"
          maxSelectedLabels={3}
          style={{ minWidth: 220, maxWidth: 360 }}
        />

        <span style={{ flex: 1 }} />

        <span style={{ fontSize: 11.5, color: 'var(--bnf-muted)' }}>
          {selection.length > 0
            ? `${selection.length} selecionada(s) • ${rows.length} total`
            : `${rows.length} nota(s)`}
        </span>

        <Button
          size="small"
          outlined
          icon="pi pi-cloud-download"
          label="Baixar faixa NSU…"
          tooltip="Re-busca um intervalo [De, Até] direto no ADN e salva no banco."
          tooltipOptions={{ position: 'top' }}
          onClick={openRangeDialog}
        />
        <Button
          size="small"
          outlined
          icon="pi pi-file"
          label={`XML (${selection.length})`}
          disabled={selection.length === 0 || bulkBusy}
          loading={bulkBusy}
          onClick={onBulkXml}
        />
        <Button
          size="small"
          outlined
          icon="pi pi-file-pdf"
          label={`PDF (${selection.length})`}
          disabled={selection.length === 0}
          onClick={onBulkPdf}
        />
        <Button
          size="small"
          outlined
          severity="success"
          icon="pi pi-file-excel"
          label={`Excel (${selection.length > 0 ? selection.length : rows.length})`}
          tooltip="Exporta a seleção (ou todas as notas filtradas) para uma planilha .xlsx."
          tooltipOptions={{ position: 'top' }}
          disabled={rows.length === 0}
          onClick={onExportExcel}
        />
        <Button
          size="small"
          text
          icon="pi pi-filter-slash"
          label="Limpar"
          onClick={onResetFilters}
        />
      </div>

      {/* Range download dialog ---------------------------------------- */}
      <RangeDownloadDialog
        state={rangeForm}
        setState={setRangeForm}
        onSubmit={onRangeSubmit}
        onCancel={cancelRangeFetch}
        onClose={closeRangeDialog}
      />


      {/* Table --------------------------------------------------------- */}
      {error && (
        <p style={{ color: 'var(--bnf-error-fg)', margin: '8px 0' }}>
          Erro ao carregar notas: {error}
        </p>
      )}

      <DataTable
        value={rows}
        loading={loading}
        size="small"
        stripedRows
        dataKey="chave"
        selectionMode="checkbox"
        selection={selection}
        onSelectionChange={(e) => setSelection(e.value as NotaDoc[])}
        paginator
        rows={25}
        rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS}
        paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown CurrentPageReport"
        currentPageReportTemplate="{first}–{last} de {totalRecords}"
        sortField="dataEmissaoISO"
        sortOrder={-1}
        removableSort
        emptyMessage="Nenhuma nota encontrada — ajuste os filtros ou faça a sincronização."
        resizableColumns
        showGridlines
        scrollable
        scrollHeight="60vh"
      >
        <Column selectionMode="multiple" headerStyle={{ width: '2.5rem' }} frozen />

        {visibleColumns.map((col) => {
          // The "Empresa (certificado)" column resolves the CNPJ to a name via
          // the live empresas list, so its body needs component scope.
          const body =
            col.key === 'ownerDoc'
              ? (r: NotaDoc) => (
                  <div className="bnf-empcol-nome" title={ownerName(r.ownerDoc)}>
                    {ownerName(r.ownerDoc)}
                  </div>
                )
              : col.body;
          return (
            <Column
              key={col.key}
              field={col.sortField ?? col.key}
              header={col.header}
              sortable={Boolean(col.sortField)}
              body={body}
              style={col.style}
            />
          );
        })}

        <Column
          header="Ações"
          body={actionsBody}
          headerStyle={{ width: '6rem', textAlign: 'right' }}
          bodyStyle={{ textAlign: 'right' }}
          frozen
          alignFrozen="right"
        />
      </DataTable>
    </section>
  );
}
