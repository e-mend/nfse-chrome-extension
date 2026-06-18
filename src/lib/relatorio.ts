// Relatório de NFSe — builds a printable HTML report of the stored notas,
// grouped by empresa and summarized with the same RESUMO cards the design
// mock shows (pdf_header.png / pdf_data.png / pdf_bottom_info.png).
//
// The report is rendered as a standalone HTML document and opened in a new
// tab; the user prints it (Ctrl+P → "Salvar como PDF"), which is exactly how
// the reference screenshots were produced — note the browser print header
// (date + document title) in pdf_header.png.
//
// We render to HTML rather than pdf-lib (used for the per-nota DANFSe) because
// the report is a flowing, multi-row table with summary cards: browser print
// handles pagination and the rounded-card layout for free.

import type { NotaDoc } from '../db/schemas/nota';
import { formatCnpjCpf } from './format';

export type RelatorioTipo = 'emitidas' | 'recebidas' | 'eventos';

export interface RelatorioEmpresaInfo {
  cnpj: string;
  razaoSocial: string;
}

export interface BuildRelatorioOptions {
  tipo: RelatorioTipo;
  /** Filter year (competência). `null` = all years. */
  ano: number | null;
  /** Filter month 1–12 (competência). `null` = whole year / all. */
  mes: number | null;
  /** Notas already filtered by tipoDocumento + competência. */
  notas: NotaDoc[];
  /** Registered empresas, used to resolve a razão social for each section. */
  empresas: RelatorioEmpresaInfo[];
  /** Generation timestamp (defaults to now). */
  geradoEm?: Date;
}

// ─── Tipo metadata ───────────────────────────────────────────────────────────

interface TipoInfo {
  /** Plural title: "Notas Recebidas". */
  titulo: string;
  /** Singular row label: "Recebida". */
  rotulo: string;
  /** Header of the counterparty column ("PRESTADOR" / "TOMADOR"). */
  contraparteHeader: string;
}

const TIPO_INFO: Record<RelatorioTipo, TipoInfo> = {
  emitidas: { titulo: 'Notas Emitidas', rotulo: 'Emitida', contraparteHeader: 'TOMADOR' },
  recebidas: { titulo: 'Notas Recebidas', rotulo: 'Recebida', contraparteHeader: 'PRESTADOR' },
  eventos: { titulo: 'Eventos', rotulo: 'Evento', contraparteHeader: 'PRESTADOR' },
};

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// ─── Number / text helpers ───────────────────────────────────────────────────

/** "1234.50" | 1234.5 → 1234.5; NaN for empty / garbage. */
function num(value: string | number | null | undefined): number {
  if (value == null || value === '') return Number.NaN;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Table-cell number: "1.234,56" or "-" when absent. */
function cellNum(value: string | number | null | undefined): string {
  const n = num(value);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Alíquota: "2,01%" or "-". */
function cellPct(value: string | number | null | undefined): string {
  const n = num(value);
  if (!Number.isFinite(n)) return '-';
  return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/** Summary card value: always "R$ 1.234,56" (treats absent as zero). */
function money(total: number): string {
  const n = Number.isFinite(total) ? total : 0;
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "—" for empty table text, escaped otherwise. */
function cellText(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  return v ? esc(v) : '-';
}

function esc(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** "2026-05-12" | "2026-05-12T..." → "12/05/2026"; pass-through otherwise. */
function dateBR(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** "2026-05" → "05/2026"; pass-through otherwise. */
function competenciaBR(value: string | null | undefined): string {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})/.exec(value);
  return m ? `${m[2]}/${m[1]}` : value;
}

function ddmmHHMM(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} às ${p(d.getHours())}:${p(
    d.getMinutes(),
  )}:${p(d.getSeconds())}`;
}

// ─── Per-nota XML extras ─────────────────────────────────────────────────────
// NfseMeta already carries every retained value we need (vISSQN, vPIS, vCOFINS,
// vCSLL, vIRRF, vINSS←vRetCP, vTotalRet). It does *not* carry the PIS/COFINS
// retention type, its CST, nor the discounts — so we pull just those four
// fields straight from the stored XML. querySelector by tag name works because
// the NFS-e XML is unprefixed (same approach as parseMeta).

interface NotaExtras {
  tpRetPisCofins: string;
  cstPisCofins: string;
  vDescIncond: string;
  vDescCond: string;
}

const EMPTY_EXTRAS: NotaExtras = {
  tpRetPisCofins: '',
  cstPisCofins: '',
  vDescIncond: '',
  vDescCond: '',
};

function parseExtras(xml: string): NotaExtras {
  try {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.querySelector('parsererror')) return EMPTY_EXTRAS;
    const root = doc.documentElement;
    const piscofins = root.querySelector('piscofins');
    return {
      tpRetPisCofins: piscofins?.querySelector('tpRetPisCofins')?.textContent?.trim() ?? '',
      cstPisCofins: piscofins?.querySelector('CST')?.textContent?.trim() ?? '',
      vDescIncond: root.querySelector('vDescIncond')?.textContent?.trim() ?? '',
      vDescCond: root.querySelector('vDescCond')?.textContent?.trim() ?? '',
    };
  } catch {
    return EMPTY_EXTRAS;
  }
}

/** ISSQN retido pelo tomador (2) ou intermediário (3); 1 = não retido. */
function isIssqnRetido(tpRetISSQN: string): boolean {
  const code = (tpRetISSQN ?? '').trim();
  return code === '2' || code === '3';
}

/** tpRetPisCofins: 1 = não retido (operação própria); 2-8 = alguma retenção. */
function isPisCofinsRetido(tpRetPisCofins: string): boolean {
  const code = (tpRetPisCofins ?? '').trim();
  return code !== '' && code !== '1';
}

// ─── Grouping ────────────────────────────────────────────────────────────────

interface Totais {
  vServ: number;
  vLiq: number;
  vTotalRet: number;
  vDesc: number;
  vRetCP: number;
  vRetIRRF: number;
  vRetPisCofinsCsll: number;
  vISSQNRetido: number;
  vISSQNNaoRetido: number;
  vPisCofinsProprio: number;
}

interface Section {
  cnpj: string;
  razaoSocial: string;
  notas: NotaDoc[];
}

/** The CNPJ/CPF that owns a nota for the chosen report tipo. */
function ownDoc(tipo: RelatorioTipo, nota: NotaDoc): string {
  if (tipo === 'emitidas') return nota.prestadorDoc;
  if (tipo === 'recebidas') return nota.tomadorDoc;
  // eventos: keyed by the mailbox it was synced under, with sensible fallbacks.
  return nota.ownerDoc || nota.meta?.autorCnpj || nota.prestadorDoc || nota.tomadorDoc || '';
}

/** Name of the nota's *own* side — used when the empresa isn't registered. */
function ownName(tipo: RelatorioTipo, nota: NotaDoc): string {
  if (tipo === 'emitidas') return nota.meta?.prestador?.nome ?? '';
  if (tipo === 'recebidas') return nota.meta?.tomador?.nome ?? '';
  return nota.meta?.prestador?.nome || nota.meta?.tomador?.nome || '';
}

function groupByEmpresa(
  tipo: RelatorioTipo,
  notas: NotaDoc[],
  empresas: RelatorioEmpresaInfo[],
): Section[] {
  const nameByCnpj = new Map(empresas.map((e) => [e.cnpj, e.razaoSocial]));
  const byDoc = new Map<string, Section>();

  for (const nota of notas) {
    const doc = ownDoc(tipo, nota);
    let section = byDoc.get(doc);
    if (!section) {
      section = {
        cnpj: doc,
        razaoSocial: nameByCnpj.get(doc) || ownName(tipo, nota) || formatCnpjCpf(doc) || 'Sem identificação',
        notas: [],
      };
      byDoc.set(doc, section);
    }
    section.notas.push(nota);
  }

  const sections = Array.from(byDoc.values());
  for (const s of sections) {
    s.notas.sort((a, b) => (a.dataEmissaoISO || '').localeCompare(b.dataEmissaoISO || ''));
  }
  sections.sort((a, b) => a.razaoSocial.localeCompare(b.razaoSocial, 'pt-BR'));
  return sections;
}

// ─── HTML rendering ──────────────────────────────────────────────────────────

interface Row {
  nota: NotaDoc;
  extras: NotaExtras;
}

function accumulate(totais: Totais, row: Row): void {
  const { nota, extras } = row;
  const m = nota.meta;
  const add = (n: number) => (Number.isFinite(n) ? n : 0);

  totais.vServ += add(num(m?.vServ));
  totais.vLiq += add(num(m?.vLiq));
  totais.vTotalRet += add(num(m?.vTotalRet));
  totais.vDesc += add(num(extras.vDescIncond)) + add(num(extras.vDescCond));
  totais.vRetCP += add(num(m?.vINSS));
  totais.vRetIRRF += add(num(m?.vIRRF));

  const vISSQN = add(num(m?.vISSQN));
  if (isIssqnRetido(m?.tpRetISSQN ?? '')) totais.vISSQNRetido += vISSQN;
  else totais.vISSQNNaoRetido += vISSQN;

  const vPis = add(num(m?.vPIS));
  const vCofins = add(num(m?.vCOFINS));
  const vCsll = add(num(m?.vCSLL));
  if (isPisCofinsRetido(extras.tpRetPisCofins)) {
    totais.vRetPisCofinsCsll += vPis + vCofins + vCsll;
  } else {
    totais.vPisCofinsProprio += vPis + vCofins;
  }
}

function renderRow(tipo: RelatorioTipo, row: Row): string {
  const { nota, extras } = row;
  const m = nota.meta;
  const info = TIPO_INFO[tipo];

  const numero = m?.numeroNFSe || m?.numeroDPS || nota.nsu || '';
  const competencia = competenciaBR(m?.competenciaMes || nota.competenciaMes);
  const emissao = dateBR(m?.dataEmissaoISO || nota.dataEmissaoISO);

  const contraparte = tipo === 'emitidas' ? m?.tomador : m?.prestador;
  const contraparteDoc = formatCnpjCpf(contraparte?.doc);
  const municipio = m?.municipio || m?.xLocIncid || m?.xLocPrestacao || '';
  const servico = [m?.cTribNac, m?.cNBS].filter(Boolean).join(' · ');

  return `<tr>
    <td><span class="rel-tipo">${esc(info.rotulo)}</span></td>
    <td class="rel-nota"><span class="rel-mag">⌕</span>${cellText(String(numero))}</td>
    <td>
      <div class="rel-emi">${cellText(emissao)}</div>
      ${competencia ? `<div class="rel-sub">${esc(competencia)}</div>` : ''}
    </td>
    <td>
      <div class="rel-party">${cellText(contraparte?.nome)}</div>
      ${contraparteDoc ? `<div class="rel-sub">${esc(contraparteDoc)}</div>` : ''}
    </td>
    <td>
      <div>${cellText(municipio)}</div>
      ${servico ? `<div class="rel-sub">${esc(servico)}</div>` : ''}
    </td>
    <td class="rel-c">${cellText(m?.tpRetISSQN)}</td>
    <td class="rel-r">${cellPct(m?.pAliqAplic)}</td>
    <td class="rel-r">${cellNum(m?.vISSQN)}</td>
    <td class="rel-c">${cellText(extras.tpRetPisCofins)}</td>
    <td class="rel-c">${cellText(extras.cstPisCofins)}</td>
    <td class="rel-r">${cellNum(m?.vPIS)}</td>
    <td class="rel-r">${cellNum(m?.vCOFINS)}</td>
    <td class="rel-r">${cellNum(m?.vCSLL)}</td>
    <td class="rel-r">${cellNum(m?.vIRRF)}</td>
    <td class="rel-r">${cellNum(m?.vINSS)}</td>
  </tr>`;
}

function renderTableHead(info: TipoInfo): string {
  const col = (head: string, sub: string, cls = '') =>
    `<th class="${cls}">${esc(head)}<span class="rel-th-sub">${esc(sub)}</span></th>`;
  return `<thead><tr>
    ${col('TIPO', '')}
    ${col('NOTA', 'nNFSe')}
    ${col('DATAS', 'dhEmi / dCompet')}
    ${col(info.contraparteHeader, 'xNome')}
    ${col('LOCAL / SERVIÇO', 'xLocIncid · cTribNac')}
    ${col('TPRET', 'ISSQN', 'rel-c')}
    ${col('ALÍQ', 'pAliq', 'rel-r')}
    ${col('ISSQN', 'vISSQN', 'rel-r')}
    ${col('TPRET', 'PisCofins', 'rel-c')}
    ${col('CST', 'PisCofins', 'rel-c')}
    ${col('PIS', 'vPis', 'rel-r')}
    ${col('COFINS', 'vCofins', 'rel-r')}
    ${col('CSLL', 'vCsll', 'rel-r')}
    ${col('IRRF', 'vIRRF', 'rel-r')}
    ${col('CP', 'vRetCP', 'rel-r')}
  </tr></thead>`;
}

function renderCard(title: string, subtitle: string, value: string, tone: 'red' | 'black'): string {
  return `<div class="rel-card">
    <div class="rel-card-t">${esc(title)}</div>
    <div class="rel-card-s">${esc(subtitle)}</div>
    <div class="rel-card-v ${tone === 'red' ? 'rel-neg' : ''}">${esc(value)}</div>
  </div>`;
}

function renderResumo(totais: Totais): string {
  const grupo = (titulo: string, cards: string) =>
    `<div class="rel-resumo">
      <div class="rel-resumo-h">${esc(titulo)}</div>
      <div class="rel-resumo-grid">${cards}</div>
    </div>`;

  const totais4 =
    renderCard('VALOR SERVIÇO', '(vServ)', money(totais.vServ), 'black') +
    renderCard('VALOR TOTAL RETENÇÕES', '(vTotalRet)', money(totais.vTotalRet), 'red') +
    renderCard('DESCONTOS', '(vDescIncond + vDescCond)', money(totais.vDesc), 'red') +
    renderCard('VALOR LÍQUIDO', '(vLiq)', money(totais.vLiq), 'black');

  const retencoes =
    renderCard('RETENÇÃO CP', '(vRetCP)', money(totais.vRetCP), 'red') +
    renderCard('RETENÇÃO IRRF', '(vRetIRRF)', money(totais.vRetIRRF), 'red') +
    renderCard('RETENÇÃO PIS/COFINS/CSLL', '(vRetPIS + vRetCOFINS + vRetCSLL)', money(totais.vRetPisCofinsCsll), 'red') +
    renderCard('RETENÇÃO ISSQN', '(vISSQN)', money(totais.vISSQNRetido), 'red');

  const impostos =
    renderCard('ISSQN NÃO RETIDO', '(vISSQN)', money(totais.vISSQNNaoRetido), 'black') +
    renderCard('PIS/COFINS OPERAÇÃO PRÓPRIA', '(vPis + vCofins)', money(totais.vPisCofinsProprio), 'black');

  return (
    grupo('RESUMO DE TOTAIS', totais4) +
    grupo('RESUMO DE RETENÇÕES', retencoes) +
    grupo('RESUMO DE IMPOSTOS', impostos)
  );
}

function renderSection(
  tipo: RelatorioTipo,
  section: Section,
  periodo: string,
  geradoEm: string,
  isFirst: boolean,
): string {
  const info = TIPO_INFO[tipo];
  const rows: Row[] = section.notas.map((nota) => ({ nota, extras: parseExtras(nota.xml) }));

  const totais: Totais = {
    vServ: 0, vLiq: 0, vTotalRet: 0, vDesc: 0, vRetCP: 0, vRetIRRF: 0,
    vRetPisCofinsCsll: 0, vISSQNRetido: 0, vISSQNNaoRetido: 0, vPisCofinsProprio: 0,
  };
  for (const row of rows) accumulate(totais, row);

  const empresaLinha = section.cnpj
    ? `${esc(section.razaoSocial)} <span class="rel-dot">·</span> ${esc(formatCnpjCpf(section.cnpj))}`
    : esc(section.razaoSocial);

  return `<section class="rel-section${isFirst ? '' : ' rel-break'}">
    <h1 class="rel-h1">Relatório de NFSe <span class="rel-dash">—</span> ${esc(info.titulo)}</h1>
    <div class="rel-empresa">${empresaLinha}</div>
    <div class="rel-meta">
      Total de ${section.notas.length} nota(s) fiscal(is)${periodo ? ` <span class="rel-dot">·</span> ${esc(periodo)}` : ''}
      <span class="rel-dot">·</span> Gerado em ${esc(geradoEm)}
    </div>
    <table class="rel-table">
      ${renderTableHead(info)}
      <tbody>${rows.map((row) => renderRow(tipo, row)).join('')}</tbody>
    </table>
    ${renderResumo(totais)}
  </section>`;
}

function renderEmpty(tipo: RelatorioTipo, periodo: string, geradoEm: string): string {
  const info = TIPO_INFO[tipo];
  return `<section class="rel-section">
    <h1 class="rel-h1">Relatório de NFSe <span class="rel-dash">—</span> ${esc(info.titulo)}</h1>
    <div class="rel-meta">
      Nenhuma nota encontrada${periodo ? ` para ${esc(periodo)}` : ''}
      <span class="rel-dot">·</span> Gerado em ${esc(geradoEm)}
    </div>
    <p class="rel-vazio">Ajuste os filtros (tipo, ano, mês) ou sincronize mais notas e tente novamente.</p>
  </section>`;
}

const STYLES = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px 28px 40px;
    font-family: Arial, Helvetica, "Segoe UI", sans-serif;
    color: #1f2937;
    font-size: 12px;
    background: #fff;
  }
  .rel-toolbar {
    position: sticky; top: 0; z-index: 10;
    display: flex; justify-content: flex-end; gap: 8px;
    margin: -8px -8px 16px; padding: 8px;
    background: #f8fafc; border-bottom: 1px solid #e5e7eb;
  }
  .rel-toolbar button {
    font: inherit; font-weight: 600; cursor: pointer;
    border: 1px solid #2563eb; background: #2563eb; color: #fff;
    border-radius: 6px; padding: 6px 14px;
  }
  .rel-toolbar .rel-hint { margin-right: auto; color: #6b7280; font-weight: 400; align-self: center; }

  .rel-break { break-before: page; page-break-before: always; }
  .rel-h1 { font-size: 18px; margin: 4px 0 2px; font-weight: 700; }
  .rel-dash { font-weight: 400; }
  .rel-empresa { font-size: 13px; font-weight: 700; margin: 0 0 1px; }
  .rel-meta { color: #6b7280; font-size: 11px; margin: 0 0 12px; }
  .rel-dot { color: #9ca3af; }

  .rel-table { width: 100%; border-collapse: collapse; margin-bottom: 22px; }
  .rel-table thead th {
    text-align: left; font-size: 10px; font-weight: 700; letter-spacing: .02em;
    padding: 7px 6px; border-top: 2px solid #111827; border-bottom: 2px solid #111827;
    vertical-align: top; white-space: nowrap;
  }
  .rel-th-sub { display: block; font-weight: 400; color: #9ca3af; font-size: 9px; margin-top: 2px; }
  .rel-table tbody td {
    padding: 6px; border-bottom: 1px solid #e5e7eb; vertical-align: top; font-size: 11px;
  }
  .rel-table tbody tr:last-child td { border-bottom: 1px solid #9ca3af; }
  .rel-r { text-align: right; white-space: nowrap; }
  .rel-c { text-align: center; }
  .rel-sub { color: #9ca3af; font-size: 10px; margin-top: 1px; }
  .rel-emi { font-weight: 600; }
  .rel-party { font-weight: 600; }
  .rel-tipo { font-weight: 600; }
  .rel-nota { white-space: nowrap; font-weight: 600; }
  .rel-mag { color: #9ca3af; margin-right: 4px; }

  .rel-resumo { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px 12px; margin-bottom: 12px; }
  .rel-resumo-h {
    font-size: 11px; font-weight: 700; letter-spacing: .03em; color: #374151;
    padding-bottom: 8px; margin-bottom: 10px; border-bottom: 1px solid #f1f5f9;
  }
  .rel-resumo-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .rel-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 8px; text-align: center; }
  .rel-card-t { font-size: 10px; font-weight: 700; color: #374151; letter-spacing: .02em; }
  .rel-card-s { font-size: 9px; color: #9ca3af; margin: 1px 0 8px; }
  .rel-card-v { font-size: 14px; font-weight: 700; color: #111827; }
  .rel-neg { color: #c0392b; }

  .rel-vazio { color: #6b7280; }

  @media print {
    body { padding: 0; }
    .rel-toolbar { display: none; }
    .rel-resumo, .rel-card, .rel-section { break-inside: avoid; }
  }
  @page { size: A4 landscape; margin: 12mm 10mm; }
`;

/**
 * Build the full standalone HTML document for the report. Groups the notas by
 * empresa (one printable section each) and appends the RESUMO summary cards.
 */
export function buildRelatorioHtml(opts: BuildRelatorioOptions): string {
  const { tipo, ano, mes, notas, empresas } = opts;
  const geradoEm = ddmmHHMM(opts.geradoEm ?? new Date());

  let periodo = '';
  if (ano && mes) periodo = `${MESES[mes - 1]} de ${ano}`;
  else if (ano) periodo = `Ano ${ano}`;

  const sections = groupByEmpresa(tipo, notas, empresas);
  const body = sections.length
    ? sections
        .map((section, i) => renderSection(tipo, section, periodo, geradoEm, i === 0))
        .join('')
    : renderEmpty(tipo, periodo, geradoEm);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Relatório NFSe</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="rel-toolbar">
    <span class="rel-hint">Use o botão ou Ctrl+P para salvar como PDF.</span>
    <button id="bnf-print-btn" type="button">Imprimir / Salvar PDF</button>
  </div>
  ${body}
</body>
</html>`;
}

/**
 * Open the report HTML in a new tab and wire the "Imprimir" button. We attach
 * the click handler from the opener instead of inlining a <script> because the
 * extension's MV3 CSP (`script-src 'self'`) blocks inline scripts — Ctrl+P
 * still works regardless. Returns false when the popup was blocked.
 */
export function openRelatorioWindow(html: string): boolean {
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  const printBtn = win.document.getElementById('bnf-print-btn');
  printBtn?.addEventListener('click', () => win.print());
  win.focus();
  return true;
}
