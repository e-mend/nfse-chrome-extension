// Build a single-page A4 DANFSe PDF following the absolute positions of
// Nota Técnica nº 008 v1.0 (SE/CGNFS-e). The layout uses pt (pdf-lib's
// native unit) but is driven by the cm coordinates of §6.x — see
// `formatters.ts` for the conversion helpers.
//
// We use Helvetica/Helvetica-Bold as metric substitutes for Arial/MS Sans
// Serif (NT-008 explicitly allows this) so the bundle stays small (no
// font fork needed). The QR Code is rendered with the `qrcode` lib then
// embedded as a PNG.

import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import {
  A4_HEIGHT,
  A4_WIDTH,
  cm,
  dash,
  topCmToY,
  truncate,
  wrap,
} from './formatters';
import type { DanfseData, DanfseParty } from './parseDanfse';

// ─── Visual constants ──────────────────────────────────────────────────────

const K = rgb(0, 0, 0);
/** 5% black — fundo dos blocos com sombreamento (NT-008 §1). */
const GRAY_5 = rgb(0.95, 0.95, 0.95);
/** 35% black — marca d'água diagonal (NT-008 §4). */
const GRAY_K35 = rgb(0.65, 0.65, 0.65);
/** Vermelho sólido para "NFS-e SEM VALIDADE JURÍDICA". */
const RED = rgb(1, 0, 0);

const BORDER_WIDTH_BLOCK = 0.5;
const BORDER_WIDTH_PAGE = 1;
const QR_X_CM = 17.48;
const QR_Y_CM = 1.67;
const QR_SIZE_CM = 1.52;

// ─── Drawing primitives ────────────────────────────────────────────────────

interface DrawCtx {
  page: PDFPage;
  font: PDFFont;
  fontBold: PDFFont;
}

interface FieldOptions {
  /** Largura disponível em pt (para o cálculo de truncamento). */
  maxLabelChars?: number;
  /** Tamanho do conteúdo (padrão 7 pt). */
  contentSize?: number;
  /** Negrito do conteúdo. */
  contentBold?: boolean;
  /** Cor do conteúdo (padrão preto). */
  contentColor?: ReturnType<typeof rgb>;
  /** Tamanho do label (padrão 6 pt). */
  labelSize?: number;
  /** True = aplica sombreamento cinza 5% no fundo do campo. */
  shaded?: boolean;
  /** True = label em CAIXA ALTA (bloco "Dados de Identificação"). */
  upperLabel?: boolean;
  /** Centraliza horizontalmente o conteúdo (útil para "Valor Líquido"). */
  centerContent?: boolean;
}

function rect(
  ctx: DrawCtx,
  xCm: number,
  topCm: number,
  widthCm: number,
  heightCm: number,
  fill: ReturnType<typeof rgb> | null,
): void {
  const x = cm(xCm);
  const y = topCmToY(topCm, cm(heightCm));
  const width = cm(widthCm);
  const height = cm(heightCm);
  if (fill) {
    ctx.page.drawRectangle({ x, y, width, height, color: fill });
  }
  ctx.page.drawRectangle({
    x,
    y,
    width,
    height,
    borderWidth: BORDER_WIDTH_BLOCK,
    borderColor: K,
  });
}

/**
 * Render a NT-008 "campo": caixa com rótulo no topo e valor logo abaixo.
 * Coordenadas em cm; respeita o sistema de coordenadas da NT (Y descendente).
 */
function field(
  ctx: DrawCtx,
  xCm: number,
  topCm: number,
  widthCm: number,
  heightCm: number,
  label: string,
  value: string,
  opts: FieldOptions = {},
): void {
  rect(ctx, xCm, topCm, widthCm, heightCm, opts.shaded ? GRAY_5 : null);

  const widthPt = cm(widthCm);
  const xPt = cm(xCm);
  const topY = A4_HEIGHT - cm(topCm);

  if (label) {
    const labelText = opts.upperLabel ? label.toUpperCase() : label;
    const labelSize = opts.labelSize ?? 6;
    const maxChars = opts.maxLabelChars ?? Math.max(8, Math.floor(widthPt / 2.4));
    ctx.page.drawText(truncate(labelText, maxChars), {
      x: xPt + 1.5,
      y: topY - labelSize - 1,
      size: labelSize,
      font: ctx.fontBold,
      color: K,
    });
  }

  const v = dash(value);
  if (v === '-' && !value) {
    // Render dash but leave room visible.
  }
  const contentSize = opts.contentSize ?? 7;
  const contentFont = opts.contentBold ? ctx.fontBold : ctx.font;
  const maxContentChars = Math.max(
    4,
    Math.floor((widthPt - 4) / (contentSize * 0.5)),
  );
  const printed = truncate(v, maxContentChars);
  const textWidth = contentFont.widthOfTextAtSize(printed, contentSize);
  const x = opts.centerContent
    ? xPt + (widthPt - textWidth) / 2
    : xPt + 2;
  ctx.page.drawText(printed, {
    x,
    y: topY - cm(heightCm) + 3,
    size: contentSize,
    font: contentFont,
    color: opts.contentColor ?? K,
  });
}

/** Title bar (faixa cinza, 7 pt negrito CAIXA ALTA — NT-008 §2). */
function title(ctx: DrawCtx, topCm: number, label: string): void {
  const heightCm = 0.42;
  rect(ctx, 0.30, topCm, 20.40, heightCm, GRAY_5);
  const topY = A4_HEIGHT - cm(topCm);
  ctx.page.drawText(label.toUpperCase(), {
    x: cm(0.30) + 3,
    y: topY - cm(heightCm) + 3,
    size: 7,
    font: ctx.fontBold,
    color: K,
  });
}

/**
 * Render a centered line (used pelas marcações "TOMADOR/DESTINATÁRIO/…
 * NÃO IDENTIFICADO" — Nota 2/3).
 */
function centerLine(
  ctx: DrawCtx,
  topCm: number,
  heightCm: number,
  text: string,
): void {
  rect(ctx, 0.30, topCm, 20.40, heightCm, null);
  const tw = ctx.fontBold.widthOfTextAtSize(text, 7);
  ctx.page.drawText(text, {
    x: cm(0.30) + (cm(20.40) - tw) / 2,
    y: topCmToY(topCm, cm(heightCm)) + (cm(heightCm) - 7) / 2,
    size: 7,
    font: ctx.fontBold,
    color: K,
  });
}

// ─── Header (bloco §6.1) ───────────────────────────────────────────────────

function drawHeader(
  ctx: DrawCtx,
  data: DanfseData,
  logo: PDFImage | null,
): void {
  // Caixa exterior do cabeçalho (1,16 cm de altura, da margem esq. à direita).
  rect(ctx, 0.30, 0.30, 20.40, 1.16, null);

  // Logomarca — escala mantendo proporção, com pequeno respiro vertical.
  if (logo) {
    const widthPt = cm(4.0);
    const heightPt = widthPt * (logo.height / logo.width);
    const maxHeight = cm(0.85);
    const scale = heightPt > maxHeight ? maxHeight / heightPt : 1;
    const w = widthPt * scale;
    const h = heightPt * scale;
    ctx.page.drawImage(logo, {
      x: cm(0.49),
      y: topCmToY(0.30, cm(1.16)) + (cm(1.16) - h) / 2,
      width: w,
      height: h,
    });
  }

  // Centro — "DANFSe v2.0" + "Documento Auxiliar da NFS-e".
  const centerX = cm(5.41);
  const centerTop = A4_HEIGHT - cm(0.30);
  const titleW = ctx.fontBold.widthOfTextAtSize('DANFSe v2.0', 9);
  ctx.page.drawText('DANFSe v2.0', {
    x: centerX + (cm(10.19) - titleW) / 2,
    y: centerTop - 14,
    size: 9,
    font: ctx.fontBold,
    color: K,
  });
  const subW = ctx.fontBold.widthOfTextAtSize('Documento Auxiliar da NFS-e', 9);
  ctx.page.drawText('Documento Auxiliar da NFS-e', {
    x: centerX + (cm(10.19) - subW) / 2,
    y: centerTop - 26,
    size: 9,
    font: ctx.fontBold,
    color: K,
  });

  if (data.header.semValidade) {
    const warn = 'NFS-e SEM VALIDADE JURÍDICA';
    const ww = ctx.fontBold.widthOfTextAtSize(warn, 9);
    ctx.page.drawText(warn, {
      x: centerX + (cm(10.19) - ww) / 2,
      y: centerTop - 38,
      size: 9,
      font: ctx.fontBold,
      color: RED,
    });
  }

  // Direita — município / ambiente gerador / tipo ambiente.
  const rightX = cm(15.62);
  if (data.header.municipioLabel) {
    ctx.page.drawText(`Município: ${data.header.municipioLabel}`, {
      x: rightX + 2,
      y: A4_HEIGHT - cm(0.30) - 9,
      size: 8,
      font: ctx.font,
      color: K,
    });
  }
  ctx.page.drawText(`Ambiente Gerador: ${dash(data.header.ambGer)}`, {
    x: rightX + 2,
    y: A4_HEIGHT - cm(0.97) - 7,
    size: 6,
    font: ctx.font,
    color: K,
  });
  ctx.page.drawText(`Tipo de Ambiente: ${dash(data.header.tpAmb)}`, {
    x: rightX + 2,
    y: A4_HEIGHT - cm(1.22) - 7,
    size: 6,
    font: ctx.font,
    color: K,
  });
}

// ─── Dados da NFS-e (bloco §6.2) ───────────────────────────────────────────

async function drawDadosNFSe(ctx: DrawCtx, data: DanfseData): Promise<void> {
  // Chave de Acesso — largura "até o QR Code".
  field(
    ctx,
    0.30,
    1.48,
    15.30,
    0.77,
    'Chave de Acesso da NFS-e',
    truncate(data.chave, 50),
    { upperLabel: true, contentSize: 8 },
  );

  // Linha 1: Número NFS-e | Competência | Data/Hora NFS-e
  field(ctx, 0.30, 2.27, 5.09, 0.67, 'Número da NFS-e', data.dados.nNFSe, {
    upperLabel: true,
  });
  field(
    ctx,
    5.41,
    2.27,
    5.09,
    0.67,
    'Competência da NFS-e',
    formatDateOrPass(data.dados.competencia),
    { upperLabel: true },
  );
  field(
    ctx,
    10.51,
    2.27,
    5.09,
    0.67,
    'Data e Hora da Emissão da NFS-e',
    formatDateTimeOrPass(data.dados.dhEmiNFSe),
    { upperLabel: true },
  );

  // Linha 2: Número DPS | Série DPS | Data/Hora DPS
  field(ctx, 0.30, 2.96, 5.09, 0.67, 'Número da DPS', data.dados.nDPS, {
    upperLabel: true,
  });
  field(ctx, 5.41, 2.96, 5.09, 0.67, 'Série da DPS', data.dados.serieDPS, {
    upperLabel: true,
  });
  field(
    ctx,
    10.51,
    2.96,
    5.09,
    0.67,
    'Data e Hora da Emissão da DPS',
    formatDateTimeOrPass(data.dados.dhEmiDPS),
    { upperLabel: true },
  );

  // Linha 3: Emitente | Situação | Finalidade
  field(
    ctx,
    0.30,
    3.65,
    5.09,
    0.67,
    'Emitente da NFS-e',
    data.dados.emitente,
    { upperLabel: true, shaded: true },
  );
  field(
    ctx,
    5.41,
    3.65,
    5.09,
    0.67,
    'Situação da NFS-e',
    truncate(data.dados.situacao, 37),
    { upperLabel: true },
  );
  field(
    ctx,
    10.51,
    3.65,
    5.09,
    0.67,
    'Finalidade',
    truncate(data.dados.finalidade, 37),
    { upperLabel: true },
  );

  // QR Code box (1.52 × 1.52 cm) + caixa de complemento (0.68 × 4.72 cm).
  rect(ctx, QR_X_CM, QR_Y_CM, QR_SIZE_CM, QR_SIZE_CM, null);
  rect(ctx, 15.80, 3.36, 4.72, 0.68, null);
  const qrCaption =
    'A autenticidade desta NFS-e pode ser verificada pela leitura deste código QR ou pela consulta da chave de acesso no portal nacional da NFS-e';
  const lines = wrap(qrCaption, 50, 3);
  lines.forEach((ln, i) => {
    ctx.page.drawText(ln, {
      x: cm(15.80) + 2,
      y: A4_HEIGHT - cm(3.36) - 7 - i * 7,
      size: 6,
      font: ctx.font,
      color: K,
    });
  });
}

async function embedQrCode(pdf: PDFDocument, chave: string): Promise<PDFImage | null> {
  if (!chave) return null;
  const url = `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${chave}`;
  try {
    const dataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 0,
      width: 256,
      color: { dark: '#000000', light: '#ffffff' },
    });
    const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0));
    return await pdf.embedPng(bytes);
  } catch (err) {
    console.warn('[DANFSe] QR Code generation failed', err);
    return null;
  }
}

// ─── Pessoas (Prestador / Tomador / Destinatário / Intermediário) ──────────

interface PartyBlockConfig {
  /** Top da primeira linha do bloco (em cm). */
  topCm: number;
  title: string;
  party: DanfseParty;
  /** Quando true, oculta a coluna "Indicador Municipal" (Destinatário). */
  hideIM?: boolean;
  /** Quando true, pinta o título do bloco com fundo cinza (Emitente). */
  shadedTitle?: boolean;
  /** Mensagem usada quando o bloco está vazio (Nota 2/3). */
  vazioMessage?: string;
}

/**
 * Renderiza um bloco padrão de pessoa (3 linhas: ids/contato → nome/email →
 * endereço completo). Retorna a altura total ocupada em cm.
 */
function drawPartyBlock(ctx: DrawCtx, cfg: PartyBlockConfig): number {
  if (cfg.party.vazio && cfg.vazioMessage) {
    centerLine(ctx, cfg.topCm, 0.42, cfg.vazioMessage);
    return 0.42;
  }

  // Linha 1: Título do bloco + CNPJ/CPF/NIF + IM + Telefone.
  const titleW = 5.09;
  rect(ctx, 0.30, cfg.topCm, titleW, 0.63, cfg.shadedTitle ? GRAY_5 : null);
  ctx.page.drawText(cfg.title.toUpperCase(), {
    x: cm(0.30) + 3,
    y: A4_HEIGHT - cm(cfg.topCm) - 9,
    size: 7,
    font: ctx.fontBold,
    color: K,
  });

  field(ctx, 5.41, cfg.topCm, 5.09, 0.63, 'CNPJ / CPF / NIF', cfg.party.doc);
  if (!cfg.hideIM) {
    field(
      ctx,
      10.51,
      cfg.topCm,
      5.09,
      0.63,
      'Inscrição Municipal',
      cfg.party.im,
    );
  } else {
    // Sem coluna de IM — preenche o espaço com a célula em branco.
    rect(ctx, 10.51, cfg.topCm, 5.09, 0.63, null);
  }
  field(ctx, 15.62, cfg.topCm, 5.09, 0.63, 'Telefone', cfg.party.fone);

  // Linha 2: Nome / Email
  const row2Top = cfg.topCm + 0.63;
  field(
    ctx,
    0.30,
    row2Top,
    10.19,
    0.63,
    'Nome / Nome Empresarial',
    truncate(cfg.party.nome, 77),
  );
  field(
    ctx,
    10.51,
    row2Top,
    10.19,
    0.63,
    'E-mail',
    truncate(cfg.party.email, 77),
  );

  // Linha 3: Endereço | Município/UF | Código IBGE/CEP
  const row3Top = cfg.topCm + 1.26;
  field(
    ctx,
    0.30,
    row3Top,
    10.19,
    0.63,
    'Endereço',
    truncate(cfg.party.endereco, 77),
  );
  field(
    ctx,
    10.51,
    row3Top,
    5.09,
    0.63,
    'Município / UF',
    truncate(cfg.party.municipioUF, 37),
  );
  field(ctx, 15.62, row3Top, 5.09, 0.63, 'Código IBGE / CEP', cfg.party.ibgeCep);

  return 0.63 * 3;
}

// ─── Bloco Prestador (extra linha §6.3) ────────────────────────────────────

function drawPrestadorExtra(ctx: DrawCtx, data: DanfseData, topCm: number): void {
  field(
    ctx,
    0.30,
    topCm,
    5.09,
    0.63,
    'Simples Nacional na Data de Competência',
    truncate(data.extraPrestador.simples, 37),
  );
  field(
    ctx,
    5.41,
    topCm,
    15.30,
    0.63,
    'Regime de Apuração Tributária pelo SN',
    truncate(data.extraPrestador.regApSN, 137),
  );
}

// ─── Bloco Serviço Prestado (§6.7) ─────────────────────────────────────────

function drawServico(ctx: DrawCtx, data: DanfseData, topCm: number): void {
  field(
    ctx,
    0.30,
    topCm,
    5.09,
    0.63,
    'Código de Tributação',
    `${dash(data.servico.cTribNacFmt)} / ${dash(data.servico.cTribMun)}`,
  );
  field(ctx, 5.41, topCm, 5.09, 0.63, 'Código da NBS', data.servico.cNBSFmt);
  field(
    ctx,
    10.51,
    topCm,
    10.19,
    0.63,
    'Local da Prestação',
    truncate(data.servico.localPrestacao, 78),
  );

  // Descrição da tributação (sem rótulo, faixa fina).
  rect(ctx, 0.30, topCm + 0.63, 20.40, 0.38, null);
  ctx.page.drawText(
    truncate(data.servico.descricaoTributacao, 167),
    {
      x: cm(0.30) + 3,
      y: topCmToY(topCm + 0.63, cm(0.38)) + 3,
      size: 7,
      font: ctx.font,
      color: K,
    },
  );

  // Descrição do Serviço (multi-linha 4 linhas).
  rect(ctx, 0.30, topCm + 1.01, 20.40, 1.20, null);
  ctx.page.drawText('Descrição do Serviço', {
    x: cm(0.30) + 2,
    y: A4_HEIGHT - cm(topCm + 1.01) - 7,
    size: 6,
    font: ctx.fontBold,
    color: K,
  });
  const descLines = wrap(data.servico.xDescServ, 130, 5);
  descLines.forEach((ln, i) => {
    ctx.page.drawText(ln, {
      x: cm(0.30) + 2,
      y: A4_HEIGHT - cm(topCm + 1.01) - 16 - i * 8,
      size: 7,
      font: ctx.font,
      color: K,
    });
  });
}

// ─── Bloco ISSQN (§6.8) ────────────────────────────────────────────────────

function drawISSQN(ctx: DrawCtx, data: DanfseData, topCm: number): number {
  if (data.issqn.semIncidencia) {
    centerLine(
      ctx,
      topCm,
      0.42,
      'TRIBUTAÇÃO MUNICIPAL (ISSQN) - OPERAÇÃO NÃO SUJEITA AO ISSQN',
    );
    return 0.42;
  }

  // Linha 1
  field(ctx, 0.30, topCm, 5.09, 0.63, 'Tipo de Tributação do ISSQN', data.issqn.tipoTrib);
  field(
    ctx,
    5.41,
    topCm,
    10.19,
    0.63,
    'Município / UF / País Incidência ISSQN',
    truncate(data.issqn.localIncidencia, 78),
  );
  field(
    ctx,
    15.62,
    topCm,
    5.09,
    0.63,
    'Regime Especial de Tributação',
    truncate(data.issqn.regimeEsp, 37),
  );

  // Linha 2
  field(ctx, 0.30, topCm + 0.63, 5.09, 0.63, 'Tipo de Imunidade', truncate(data.issqn.tipoImunidade, 37));
  field(
    ctx,
    5.41,
    topCm + 0.63,
    5.09,
    0.63,
    'Suspensão da Exigibilidade do ISSQN',
    truncate(data.issqn.suspensao, 37),
  );
  field(ctx, 10.51, topCm + 0.63, 5.09, 0.63, 'Número Processo Suspensão', data.issqn.nProcessoSusp);
  field(ctx, 15.62, topCm + 0.63, 5.09, 0.63, 'Benefício Municipal', truncate(data.issqn.beneficioMun, 37));

  // Linha 3
  field(ctx, 0.30, topCm + 1.26, 5.09, 0.63, 'Cálculo do BM', data.issqn.calculoBM);
  field(ctx, 5.41, topCm + 1.26, 5.09, 0.63, 'Total Deduções/Reduções', data.issqn.totalDeducoes);
  field(ctx, 10.51, topCm + 1.26, 5.09, 0.63, 'Desconto Incondicionado', data.issqn.descIncond);
  field(ctx, 15.62, topCm + 1.26, 5.09, 0.63, 'Retenção do ISSQN', data.issqn.retencao);

  // Linha 4
  field(ctx, 0.30, topCm + 1.89, 5.09, 0.63, 'BC ISSQN', data.issqn.vBC);
  field(ctx, 5.41, topCm + 1.89, 5.09, 0.63, 'Alíquota Aplicada', data.issqn.pAliqAplic);
  field(ctx, 10.51, topCm + 1.89, 5.09, 0.63, 'ISSQN Apurado', data.issqn.vISSQN);
  rect(ctx, 15.62, topCm + 1.89, 5.09, 0.63, null);

  return 0.63 * 4;
}

// ─── Bloco Federal (§6.9, Nota 6) ──────────────────────────────────────────

function drawFederal(ctx: DrawCtx, data: DanfseData, topCm: number): number {
  if (!data.federal.ativo) return 0;
  // Linha 1
  rect(ctx, 0.30, topCm, 5.09, 0.63, null);
  field(ctx, 5.41, topCm, 5.09, 0.63, 'IRRF', data.federal.vIRRF);
  field(ctx, 10.51, topCm, 5.09, 0.63, 'Contribuição Previdenciária Retida', data.federal.vRetCP);
  field(ctx, 15.62, topCm, 5.09, 0.63, 'Contribuições Sociais Retidas', data.federal.vRetCSLL);

  // Linha 2
  field(ctx, 0.30, topCm + 0.63, 5.09, 0.63, 'PIS - Débito Apuração Própria', data.federal.vPIS);
  field(ctx, 5.41, topCm + 0.63, 5.09, 0.63, 'COFINS - Débito Apuração Própria', data.federal.vCOFINS);
  field(
    ctx,
    10.51,
    topCm + 0.63,
    10.19,
    0.63,
    'Descrição Contrib. Sociais Retidas',
    truncate(data.federal.tpRetPisCofins, 75),
  );

  return 0.63 * 2;
}

// ─── Bloco IBS/CBS (§6.10) ────────────────────────────────────────────────

function drawIBSCBS(ctx: DrawCtx, data: DanfseData, topCm: number): number {
  // Linha 1
  rect(ctx, 0.30, topCm, 5.09, 0.63, null);
  field(ctx, 5.41, topCm, 5.09, 0.63, 'CST / cClassTrib', data.ibscbs.cstCClassTrib);
  field(
    ctx,
    10.51,
    topCm,
    10.19,
    0.63,
    'Indicador de Operação / Município Incidência',
    truncate(data.ibscbs.indOpLocalidade, 75),
  );

  // Linha 2
  field(ctx, 0.30, topCm + 0.63, 5.09, 0.63, 'Exclusões e Reduções da BC', data.ibscbs.exclusoesReducoes);
  field(ctx, 5.41, topCm + 0.63, 5.09, 0.63, 'BC Após Exclusões e Reduções', data.ibscbs.vBCAposExclusoes);
  field(ctx, 10.51, topCm + 0.63, 5.09, 0.63, 'Red. Alíquota IBS / CBS', truncate(data.ibscbs.redAliq, 28));
  field(ctx, 15.62, topCm + 0.63, 5.09, 0.63, 'Alíquota IBS UF / Mun', truncate(data.ibscbs.aliqIBS, 28));

  // Linha 3
  field(ctx, 0.30, topCm + 1.26, 5.09, 0.63, 'Alíq. Efetiva Mun - IBS', data.ibscbs.pAliqEfetMun);
  field(ctx, 5.41, topCm + 1.26, 5.09, 0.63, 'Valor Apurado Mun - IBS', data.ibscbs.vIBSMun);
  field(ctx, 10.51, topCm + 1.26, 5.09, 0.63, 'Alíq. Efetiva Estad - IBS', data.ibscbs.pAliqEfetUF);
  field(ctx, 15.62, topCm + 1.26, 5.09, 0.63, 'Valor Apurado Estad - IBS', data.ibscbs.vIBSUF);

  // Linha 4
  field(ctx, 0.30, topCm + 1.89, 5.09, 0.63, 'Valor Total Apurado - IBS', data.ibscbs.vIBSTot);
  field(ctx, 5.41, topCm + 1.89, 5.09, 0.63, 'Alíquota - CBS', data.ibscbs.pCBS);
  field(ctx, 10.51, topCm + 1.89, 5.09, 0.63, 'Alíq. Efetiva - CBS', data.ibscbs.pAliqEfetCBS);
  field(ctx, 15.62, topCm + 1.89, 5.09, 0.63, 'Valor Total Apurado - CBS', data.ibscbs.vCBS);

  return 0.63 * 4;
}

// ─── Bloco Valor Total (§6.11) ─────────────────────────────────────────────

function drawValorTotal(ctx: DrawCtx, data: DanfseData, topCm: number): number {
  field(ctx, 0.30, topCm, 5.09, 0.67, 'Valor da Operação / Serviço', data.totais.vServ);
  field(ctx, 5.41, topCm, 5.09, 0.67, 'Desconto Incondicionado', data.totais.vDescIncond);
  field(ctx, 10.51, topCm, 5.09, 0.67, 'Desconto Condicionado', data.totais.vDescCond);
  rect(ctx, 15.62, topCm, 5.09, 0.67, null);

  field(
    ctx,
    0.30,
    topCm + 0.67,
    5.09,
    0.67,
    'Total das Retenções (ISSQN/Federais)',
    data.totais.vTotalRet,
  );
  field(ctx, 5.41, topCm + 0.67, 5.09, 0.67, 'Valor Líquido da NFS-e', data.totais.vLiq);
  field(ctx, 10.51, topCm + 0.67, 5.09, 0.67, 'Total do IBS / CBS', data.totais.vIBSCBSTot);
  field(
    ctx,
    15.62,
    topCm + 0.67,
    5.09,
    0.67,
    'Valor Líquido + IBS/CBS',
    data.totais.vTotNF,
    { shaded: true, contentBold: true, contentSize: 8 },
  );

  return 0.67 * 2;
}

// ─── Bloco Informações Complementares (§6.12) ─────────────────────────────

function drawInformacoes(ctx: DrawCtx, data: DanfseData, topCm: number): number {
  const allText = data.info.linhas.join(' | ');
  const text = truncate(allText, 1997);
  const lines = wrap(text, 130, 18);
  const heightCm = Math.max(0.39, lines.length * 0.32);

  rect(ctx, 0.30, topCm, 20.40, heightCm, null);
  lines.forEach((ln, i) => {
    ctx.page.drawText(ln, {
      x: cm(0.30) + 2,
      y: A4_HEIGHT - cm(topCm) - 8 - i * 9,
      size: 7,
      font: ctx.font,
      color: K,
    });
  });

  return heightCm;
}

// ─── Canhoto opcional (§6.13) ──────────────────────────────────────────────

function drawCanhoto(ctx: DrawCtx, data: DanfseData): void {
  const topCm = 28.10;
  field(ctx, 0.30, topCm, 5.09, 0.67, 'Data Cientificação', '');
  field(ctx, 5.41, topCm, 5.09, 0.67, 'Identificação e Assinatura', '');
  field(
    ctx,
    10.51,
    topCm,
    10.19,
    0.67,
    'Nº NFS-e / Chave NFS-e',
    `${dash(data.dados.nNFSe)} / ${truncate(data.chave, 50)}`,
  );
}

// ─── Marca d'água diagonal (§4) ────────────────────────────────────────────

function drawWatermark(ctx: DrawCtx, data: DanfseData): void {
  if (!data.marcaDagua) return;
  const text = data.marcaDagua;
  const size = 70;
  const textWidth = ctx.font.widthOfTextAtSize(text, size);
  // Posição girada 45° em torno do centro do papel.
  const a = Math.PI / 4;
  const cs = Math.cos(a);
  const sn = Math.sin(a);
  ctx.page.drawText(text, {
    x: A4_WIDTH / 2 - (textWidth / 2) * cs + (size * 0.35) * sn,
    y: A4_HEIGHT / 2 - (textWidth / 2) * sn - (size * 0.35) * cs,
    size,
    font: ctx.font,
    color: GRAY_K35,
    rotate: degrees(45),
  });
}

// ─── Date helpers (mantêm o valor como veio quando não é ISO) ─────────────

function formatDateOrPass(value: string): string {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
}

function formatDateTimeOrPass(value: string): string {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):?(\d{2})?/.exec(value);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}:${m[6] ?? '00'}` : value;
}

// ─── Public entry point ────────────────────────────────────────────────────

export interface BuildDanfseDeps {
  /** PNG (Uint8Array) com a logomarca NFS-e. Opcional — o layout faz fallback. */
  logoBytes?: Uint8Array | null;
}

/**
 * Build a single-page A4 DANFSe PDF for `data`. Returns the PDF as a
 * `Uint8Array` — the caller is responsible for downloading / saving it.
 */
export async function buildDanfsePdf(
  data: DanfseData,
  deps: BuildDanfseDeps = {},
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let logo: PDFImage | null = null;
  if (deps.logoBytes) {
    try {
      logo = await pdf.embedPng(deps.logoBytes);
    } catch (err) {
      console.warn('[DANFSe] failed to embed NFSe logo', err);
    }
  }

  // Borda externa (1 pt, NT-008 §1).
  page.drawRectangle({
    x: 0.5,
    y: 0.5,
    width: A4_WIDTH - 1,
    height: A4_HEIGHT - 1,
    borderWidth: BORDER_WIDTH_PAGE,
    borderColor: K,
  });

  const ctx: DrawCtx = { page, font, fontBold };

  // QR Code precisa ser embutido antes do header pra ter PNG pronto.
  const qrImage = await embedQrCode(pdf, data.chave);
  if (qrImage) {
    const qrSize = cm(QR_SIZE_CM);
    page.drawImage(qrImage, {
      x: cm(QR_X_CM),
      y: topCmToY(QR_Y_CM, qrSize),
      width: qrSize,
      height: qrSize,
    });
  }

  drawHeader(ctx, data, logo);
  await drawDadosNFSe(ctx, data);

  // Bloco Prestador (§6.3).
  drawPartyBlock(ctx, {
    topCm: 4.34,
    title: 'EMITENTE DA NFS-e',
    party: data.prestador,
    shadedTitle: true,
  });
  drawPrestadorExtra(ctx, data, 4.34 + 0.63 * 3);

  // Bloco Tomador (§6.4).
  drawPartyBlock(ctx, {
    topCm: 6.92,
    title: 'TOMADOR / ADQUIRENTE DA OPERAÇÃO',
    party: data.tomador,
    vazioMessage: 'TOMADOR/ADQUIRENTE DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e',
  });

  // Bloco Destinatário (§6.5) — sem coluna IM. Quando coincidir com tomador,
  // a linha "DESTINATÁRIO É O PRÓPRIO TOMADOR" entra no lugar.
  const destinatarioEhTomador =
    !data.destinatario.vazio &&
    data.tomador.docDigits &&
    data.destinatario.docDigits === data.tomador.docDigits;
  if (destinatarioEhTomador) {
    centerLine(ctx, 8.86, 0.42, 'O DESTINATÁRIO É O PRÓPRIO TOMADOR/ADQUIRENTE DA OPERAÇÃO');
  } else {
    drawPartyBlock(ctx, {
      topCm: 8.86,
      title: 'DESTINATÁRIO DA OPERAÇÃO',
      party: data.destinatario,
      hideIM: true,
      vazioMessage: 'DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e',
    });
  }

  // Bloco Intermediário (§6.6).
  drawPartyBlock(ctx, {
    topCm: 10.80,
    title: 'INTERMEDIÁRIO DA OPERAÇÃO',
    party: data.intermediario,
    vazioMessage: 'INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e',
  });

  // Bloco Serviço (§6.7).
  title(ctx, 12.74 - 0.42, 'SERVIÇO PRESTADO');
  drawServico(ctx, data, 12.74);

  // Bloco Tributação Municipal (§6.8).
  title(ctx, 14.43 - 0.42, 'TRIBUTAÇÃO MUNICIPAL (ISSQN)');
  drawISSQN(ctx, data, 14.43);

  // Bloco Tributação Federal (§6.9) — só até competência 2026.
  if (data.federal.ativo) {
    title(ctx, 17.02 - 0.42, 'TRIBUTAÇÃO FEDERAL');
    drawFederal(ctx, data, 17.02);
  }

  // Bloco IBS/CBS (§6.10).
  title(ctx, 18.32 - 0.42, 'TRIBUTAÇÃO IBS / CBS');
  drawIBSCBS(ctx, data, 18.32);

  // Bloco Valor Total (§6.11).
  title(ctx, 20.90 - 0.42, 'VALOR TOTAL DA NFS-e');
  drawValorTotal(ctx, data, 20.90);

  // Bloco Informações Complementares (§6.12).
  title(ctx, 22.27, 'INFORMAÇÕES COMPLEMENTARES');
  drawInformacoes(ctx, data, 22.68);

  // Canhoto opcional (§6.13).
  drawCanhoto(ctx, data);

  // Marca d'água diagonal (§4).
  drawWatermark(ctx, data);

  return await pdf.save();
}

