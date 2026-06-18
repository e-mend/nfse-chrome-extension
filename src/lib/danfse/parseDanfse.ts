// Parses a NFS-e XML (and, optionally, the events that affect it) into the
// shape consumed by `buildDanfsePdf`. The mapping mirrors the column
// "Caminho XML" of every table in §6 of the NT-008 v1.0.
//
// All getters are tolerant to missing nodes / namespaces: they navigate by
// `localName` so the parser still works regardless of the namespace prefix
// the ADN happens to put on the root element.

import { municipioNome, municipioUF } from './ibge';

// ─── Public types ──────────────────────────────────────────────────────────

export type DanfseMarkType = '' | 'CANCELADA' | 'SUBSTITUÍDA';

export interface DanfseParty {
  /** Display label that goes in the "CNPJ / CPF / NIF" cell, already formatted. */
  doc: string;
  /** Raw 11/14-digit document (digits only) — empty when not provided. */
  docDigits: string;
  im: string;
  fone: string;
  nome: string;
  email: string;
  endereco: string;
  /** "Município / UF" (or just the city for foreign addresses). */
  municipioUF: string;
  /** "1234567 / 12.345-678" — IBGE + CEP, joined per NT-008 §6.3. */
  ibgeCep: string;
  /** True when the block has neither a doc nor a name. */
  vazio: boolean;
}

export interface DanfseHeader {
  municipioEmit: string;
  ufEmit: string;
  /** Pre-formatted "Município: <nome> / <uf>" per §6.1 obs. */
  municipioLabel: string;
  /** Descrição amigável de `ambGer` (Produção / Restrita). */
  ambGer: string;
  /** Descrição amigável de `tpAmb` (Produção / Homologação). */
  tpAmb: string;
  /** Indica que o documento é teste — controla a marca vermelha do header. */
  semValidade: boolean;
}

export interface DanfseDados {
  chave: string;
  nNFSe: string;
  competencia: string;
  dhEmiNFSe: string;
  nDPS: string;
  serieDPS: string;
  dhEmiDPS: string;
  /** Descrição amigável de `tpEmit` (Prestador / Tomador / Intermediário). */
  emitente: string;
  /** Descrição amigável de `cStat` (Autorizada / etc.). */
  situacao: string;
  /** Descrição amigável de `finNFSe`. */
  finalidade: string;
}

export interface DanfseServico {
  cTribNacFmt: string;
  cTribMun: string;
  cNBSFmt: string;
  /** "Município / UF / País" da prestação. */
  localPrestacao: string;
  /** Texto que aparece na faixa cinza acima da descrição. */
  descricaoTributacao: string;
  xDescServ: string;
}

export interface DanfseIssqn {
  tipoTrib: string;
  localIncidencia: string;
  regimeEsp: string;
  tipoImunidade: string;
  suspensao: string;
  nProcessoSusp: string;
  beneficioMun: string;
  calculoBM: string;
  totalDeducoes: string;
  descIncond: string;
  vBC: string;
  pAliqAplic: string;
  retencao: string;
  vISSQN: string;
  /** True quando o XML não traz nenhuma incidência de ISSQN — Nota 4. */
  semIncidencia: boolean;
}

export interface DanfseFederal {
  vIRRF: string;
  vRetCP: string;
  vRetCSLL: string;
  vPIS: string;
  vCOFINS: string;
  tpRetPisCofins: string;
  /** False quando a competência for posterior a 2026 (Nota 6) — bloco oculto. */
  ativo: boolean;
}

export interface DanfseIBSCBS {
  cstCClassTrib: string;
  indOpLocalidade: string;
  exclusoesReducoes: string;
  vBCAposExclusoes: string;
  redAliq: string;
  aliqIBS: string;
  pAliqEfetMun: string;
  vIBSMun: string;
  pAliqEfetUF: string;
  vIBSUF: string;
  vIBSTot: string;
  pCBS: string;
  pAliqEfetCBS: string;
  vCBS: string;
}

export interface DanfseTotais {
  vServ: string;
  vDescIncond: string;
  vDescCond: string;
  vTotalRet: string;
  vLiq: string;
  /** Soma `vIBSTot + vCBS`. */
  vIBSCBSTot: string;
  /** Total final (vLiq + IBS/CBS). Vai no bloco com fundo cinza. */
  vTotNF: string;
}

export interface DanfseInfo {
  /** Linhas finais de Informações Complementares, já com rótulos NT-008. */
  linhas: string[];
}

export interface DanfseExtraPrestador {
  /** Descrição amigável de `opSimpNac`. */
  simples: string;
  /** Descrição amigável de `regApTribSN`. */
  regApSN: string;
}

export interface DanfseData {
  /** Chave de acesso (50 dígitos, sem prefixo "NFS"). */
  chave: string;
  /** Marca d'água diagonal (cancelada / substituída) — string vazia = nenhuma. */
  marcaDagua: DanfseMarkType;
  /** Set quando a competência ainda exibe o bloco Tributação Federal. */
  competenciaAno: number | null;

  header: DanfseHeader;
  dados: DanfseDados;
  prestador: DanfseParty;
  /** Campos extras do prestador (Simples Nacional, Regime SN) — exibidos na linha de baixo. */
  extraPrestador: DanfseExtraPrestador;
  tomador: DanfseParty;
  /** Destinatário = `IBSCBS/dest` (não tem IM, vide §6.5). */
  destinatario: DanfseParty;
  intermediario: DanfseParty;
  servico: DanfseServico;
  issqn: DanfseIssqn;
  federal: DanfseFederal;
  ibscbs: DanfseIBSCBS;
  totais: DanfseTotais;
  info: DanfseInfo;
}

// ─── Low-level XML navigation (namespace-tolerant) ─────────────────────────

const childByLocalName = (el: Element | null, name: string): Element | null => {
  if (!el) return null;
  for (let c = el.firstElementChild; c; c = c.nextElementSibling) {
    if (c.localName === name) return c;
  }
  return null;
};

const childText = (el: Element | null, name: string): string => {
  const child = childByLocalName(el, name);
  return child ? (child.textContent ?? '').trim() : '';
};

/** Walk the tree breadth-first, returning the first element with `localName`. */
const deepByLocalName = (el: Element | null, name: string): Element | null => {
  if (!el) return null;
  const stack: Element[] = [el];
  while (stack.length) {
    const node = stack.shift()!;
    for (let c = node.firstElementChild; c; c = c.nextElementSibling) {
      if (c.localName === name) return c;
      stack.push(c);
    }
  }
  return null;
};

const deepText = (el: Element | null, name: string): string => {
  const child = deepByLocalName(el, name);
  return child ? (child.textContent ?? '').trim() : '';
};

// ─── Descriptors (kept inline to avoid a circular import) ──────────────────

import {
  describeAmbGer,
  describeCStat,
  describeFinNFSe,
  describeOpSimpNac,
  describeRegApTribSN,
  describeRegEspTrib,
  describeTpAmb,
  describeTpBM,
  describeTpEmit,
  describeTpImunidade,
  describeTpRetISSQN,
  describeTpRetPisCofins,
  describeTpSusp,
  describeTribISSQN,
} from './descriptors';
import {
  formatCNBS,
  formatCTribNac,
  formatCep,
  formatDoc,
  formatMoney,
  formatPercent,
  formatPhone,
  joinAddress,
  joinLocation,
  parseNumber,
  sumMoney,
} from './formatters';

// ─── Parties (Prestador / Tomador / Destinatário / Intermediário) ──────────

/**
 * Build a `DanfseParty` for a node that follows the Tomador/Intermediário
 * shape: `xNome + CNPJ|CPF|NIF + IM + fone + email + end/...`. The
 * destinatário variant (§6.5) skips `IM`; pass `includeIM=false` to omit it.
 */
function buildParty(
  party: Element | null,
  options: { addressFromEndChild?: boolean; includeIM?: boolean } = {},
): DanfseParty {
  if (!party) {
    return {
      doc: '',
      docDigits: '',
      im: '',
      fone: '',
      nome: '',
      email: '',
      endereco: '',
      municipioUF: '',
      ibgeCep: '',
      vazio: true,
    };
  }

  const cnpj = childText(party, 'CNPJ');
  const cpf = childText(party, 'CPF');
  const nif = childText(party, 'NIF');
  const docDigits = (cnpj || cpf).replace(/\D/g, '');
  const docFmt = cnpj || cpf ? formatDoc(cnpj || cpf) : nif;

  const includeIM = options.includeIM !== false;
  const im = includeIM ? childText(party, 'IM') : '';
  const fone = childText(party, 'fone');
  const email = childText(party, 'email');
  const xNome = childText(party, 'xNome');

  // O nó "end" envolve o "endNac" / "endExt" para tomador/destinatário/etc.,
  // mas para o emit a estrutura é "enderNac" / "enderExt" no próprio party.
  const endRoot = options.addressFromEndChild
    ? childByLocalName(party, 'end')
    : party;
  const endNac =
    childByLocalName(endRoot, 'endNac') ?? childByLocalName(endRoot, 'enderNac');
  const endExt =
    childByLocalName(endRoot, 'endExt') ?? childByLocalName(endRoot, 'enderExt');

  let municipioUFLabel = '';
  let ibgeCep = '';
  if (endNac) {
    const cMun = childText(endNac, 'cMun');
    const ufFb = childText(endNac, 'UF');
    municipioUFLabel = joinLocation([municipioNome(cMun), municipioUF(cMun, ufFb)]);
    const cep = childText(endNac, 'CEP');
    ibgeCep = joinLocation([cMun, formatCep(cep)]);
  } else if (endExt) {
    const xCidade = childText(endExt, 'xCidade');
    municipioUFLabel = xCidade;
    const cEndPost = childText(endExt, 'cEndPost');
    ibgeCep = cEndPost ? `- / ${cEndPost}` : '';
  }

  // Endereço (xLgr+nro+xCpl+xBairro) fica direto no nó "end" (ou na raiz para
  // o emit, que coloca os campos no enderNac).
  const addrSource = options.addressFromEndChild
    ? endRoot ?? party
    : endNac ?? endExt ?? party;
  const endereco = joinAddress([
    childText(addrSource, 'xLgr'),
    childText(addrSource, 'nro'),
    childText(addrSource, 'xCpl'),
    childText(addrSource, 'xBairro'),
  ]);

  const vazio = !docDigits && !nif && !xNome;
  return {
    doc: docFmt,
    docDigits,
    im,
    fone: formatPhone(fone),
    nome: xNome,
    email,
    endereco,
    municipioUF: municipioUFLabel,
    ibgeCep,
    vazio,
  };
}

// ─── Event parser (cancelamento / substituição) ────────────────────────────

export interface DanfseEvento {
  chave: string;
  tipo: DanfseMarkType;
  motivo: string;
  autor: string;
  dhEvento: string;
}

/**
 * Lê um XML de evento e devolve a marca-d'água que ele induz, se houver.
 *
 * Retorna `null` quando o XML não é um evento reconhecível (assim o caller
 * pode tratar ambos os formatos — NFS-e e evento — com o mesmo guard).
 */
export function parseEvento(xml: string): DanfseEvento | null {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) return null;
  const root = doc.documentElement;
  const infPedReg = deepByLocalName(root, 'infPedReg');
  if (!infPedReg) return null;

  const chave = deepText(infPedReg, 'chNFSe').replace(/\D/g, '');
  if (!chave) return null;

  // O elemento com o tipo do evento é o filho cujo localName casa /^e\d{4,}$/
  // (ex.: `e101101`, `e105102`).
  let tipoEl: Element | null = null;
  for (let c = infPedReg.firstElementChild; c; c = c.nextElementSibling) {
    if (/^e\d{4,}$/.test(c.localName)) {
      tipoEl = c;
      break;
    }
  }
  const tpEvento = tipoEl ? tipoEl.localName.slice(1) : '';
  const xDesc = tipoEl ? deepText(tipoEl, 'xDesc') : '';
  const motivo = tipoEl ? deepText(tipoEl, 'xMotivo') : '';

  let tipo: DanfseMarkType = '';
  if (/substitu/i.test(xDesc) || tpEvento === '105102') tipo = 'SUBSTITUÍDA';
  else if (/cancel/i.test(xDesc) || tpEvento === '101101') tipo = 'CANCELADA';

  return {
    chave,
    tipo,
    motivo,
    autor: deepText(infPedReg, 'CNPJAutor') || deepText(infPedReg, 'CPFAutor'),
    dhEvento: deepText(infPedReg, 'dhEvento') || deepText(root, 'dhProc'),
  };
}

// ─── DanfseData parser ─────────────────────────────────────────────────────

/** Per §6.12 — junta as informações com `|` mantendo ordem fixa da NT. */
function buildInfoLines(args: {
  xInfComp: string;
  chSubstda: string;
  docRef: string;
  cObra: string;
  inscImobFisc: string;
  idAtvEvt: string;
  idDocTec: string;
  xPed: string;
  xItemPed: string;
  xOutInf: string;
  totaisAprox: { fed?: string; est?: string; mun?: string; sn?: string };
}): string[] {
  const out: string[] = [];
  const push = (label: string, value: string | null | undefined) => {
    const v = (value ?? '').trim();
    if (v) out.push(`${label} ${v}`);
  };

  push('Inf. Cont.:', args.xInfComp);
  push('NFS-e Subst.:', args.chSubstda);
  push('Doc. Ref.:', args.docRef);
  push('Cod. Obra:', args.cObra);
  push('Insc. Imob.:', args.inscImobFisc);
  push('Cod. Evt.:', args.idAtvEvt);
  push('Doc. Tec.:', args.idDocTec);
  push('Núm. Ped.:', args.xPed);
  push('Item Ped.:', args.xItemPed);
  push('Inf. A. T. Mun.:', args.xOutInf);

  // Totais Aproximados de Tributos (Nota 10 — obrigatório).
  const { fed, est, mun, sn } = args.totaisAprox;
  const renderTotal = (v: string | undefined): string => {
    if (!v) return '-';
    const n = parseNumber(v);
    if (!Number.isFinite(n)) return '-';
    return formatMoney(v);
  };
  if (sn) {
    out.push(
      `Totais Aproximados dos Tributos cfe. Lei nº 12.741/2012 (Simples Nacional): ${formatPercent(sn)} sobre o valor do serviço`,
    );
  } else {
    out.push(
      `Totais Aproximados dos Tributos cfe. Lei nº 12.741/2012: ` +
        `Federais: ${renderTotal(fed)} ; ` +
        `Estaduais: ${renderTotal(est)} ; ` +
        `Municipais: ${renderTotal(mun)}`,
    );
  }
  return out;
}

/**
 * Convert one NFS-e XML into the structured DanfseData. Returns `null` when
 * the XML can't be parsed or doesn't contain an `infNFSe` block (so events
 * and DPS-only payloads aren't mistakenly fed to the layout).
 *
 * `evento` is optional — when present, sets the marca d'água diagonal
 * (CANCELADA / SUBSTITUÍDA) per Nota 4 da NT-008.
 */
export function parseDanfse(
  xml: string,
  options: { evento?: DanfseEvento | null } = {},
): DanfseData | null {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) return null;
  const root = doc.documentElement;
  const infNFSe = childByLocalName(root, 'infNFSe');
  if (!infNFSe) return null;

  const emit = childByLocalName(infNFSe, 'emit');
  const emitEndNac =
    childByLocalName(emit, 'enderNac') ?? childByLocalName(emit, 'enderExt');
  const valNFSe = childByLocalName(infNFSe, 'valores');
  const DPS = childByLocalName(infNFSe, 'DPS');
  const infDPS = childByLocalName(DPS, 'infDPS');

  const prest = childByLocalName(infDPS, 'prest');
  const regTrib = childByLocalName(prest, 'regTrib');
  const toma = childByLocalName(infDPS, 'toma');
  const interm = childByLocalName(infDPS, 'interm');
  const serv = childByLocalName(infDPS, 'serv');
  const cServ = childByLocalName(serv, 'cServ');

  const valDPS = childByLocalName(infDPS, 'valores');
  const trib = childByLocalName(valDPS, 'trib');
  const tribMun = childByLocalName(trib, 'tribMun');
  const tribFed = childByLocalName(trib, 'tribFed');
  const piscofins = childByLocalName(tribFed, 'piscofins');
  const totTrib = childByLocalName(trib, 'totTrib');
  const ibscbsDPS = childByLocalName(infDPS, 'IBSCBS');
  const ibscbsValores = childByLocalName(ibscbsDPS, 'valores');
  const ibscbsValoresUF = childByLocalName(ibscbsValores, 'uf');
  const ibscbsValoresMun = childByLocalName(ibscbsValores, 'mun');
  const ibscbsValoresFed = childByLocalName(ibscbsValores, 'fed');
  const totCIBS = childByLocalName(ibscbsDPS, 'totCIBS');
  const gIBS = childByLocalName(totCIBS, 'gIBS');
  const gIBSMunTot = childByLocalName(gIBS, 'gIBSMunTot');
  const gIBSUFTot = childByLocalName(gIBS, 'gIBSUFTot');
  const gCBS = childByLocalName(totCIBS, 'gCBS');
  const ibscbsDest = childByLocalName(ibscbsDPS, 'dest');

  // ── Chave (sem prefixo "NFS") ──
  const idAttr = infNFSe.getAttribute('Id') ?? '';
  const chave = idAttr.replace(/^NFS/i, '').replace(/\D/g, '');

  // ── Header ──
  const cLocEmi = childText(emitEndNac, 'cMun') || childText(infNFSe, 'cLocEmi');
  const ufEmit = municipioUF(cLocEmi, childText(emitEndNac, 'UF'));
  const xLocEmi = childText(infNFSe, 'xLocEmi') || municipioNome(cLocEmi);
  const cTribNacRaw = childText(cServ, 'cTribNac');
  const semMunicipio = cTribNacRaw.replace(/\D/g, '').startsWith('99');
  const ambGer = childText(infNFSe, 'ambGer');
  const tpAmb = childText(infDPS, 'tpAmb');

  const header: DanfseHeader = {
    municipioEmit: xLocEmi,
    ufEmit,
    municipioLabel: semMunicipio
      ? ''
      : joinLocation([xLocEmi, ufEmit]),
    ambGer: describeAmbGer(ambGer),
    tpAmb: describeTpAmb(tpAmb),
    semValidade: tpAmb === '2',
  };

  // ── Dados ──
  const dados: DanfseDados = {
    chave,
    nNFSe: childText(infNFSe, 'nNFSe'),
    competencia: childText(infDPS, 'dCompet'),
    dhEmiNFSe: childText(infNFSe, 'dhProc'),
    nDPS: childText(infDPS, 'nDPS'),
    serieDPS: childText(infDPS, 'serie'),
    dhEmiDPS: childText(infDPS, 'dhEmi'),
    emitente: describeTpEmit(childText(infDPS, 'tpEmit')),
    situacao: describeCStat(childText(infNFSe, 'cStat')),
    finalidade: describeFinNFSe(childText(ibscbsDPS, 'finNFSe')),
  };

  // ── Partes ──
  // Emitente / Prestador: identidade fica em `emit`, endereço em `emit/enderNac`.
  const prestadorParty = buildParty(emit, { addressFromEndChild: false });
  // O telefone do prestador é exibido como o do "emit" (usado em emitidas) ou
  // do nó `prest` quando o XML coloca lá. Tentamos os dois.
  if (!prestadorParty.fone) {
    prestadorParty.fone = formatPhone(childText(prest, 'fone'));
  }
  if (!prestadorParty.im) prestadorParty.im = childText(prest, 'IM');

  const tomador = buildParty(toma, { addressFromEndChild: true });
  const intermediario = buildParty(interm, { addressFromEndChild: true });
  const destinatario = buildParty(ibscbsDest, {
    addressFromEndChild: true,
    includeIM: false,
  });

  // ── Serviço ──
  const cTribMun = childText(cServ, 'cTribMun');
  const xTribMun = childText(cServ, 'xTribMun');
  const xTribNac = childText(cServ, 'xTribNac');
  const locPrest = childByLocalName(serv, 'locPrest');
  const xLocPrestacao = childText(locPrest, 'xLocPrestacao');
  const cPaisPrestacao = childText(locPrest, 'cPaisPrestacao');
  const xMunPrest =
    childText(locPrest, 'cMun') ? municipioNome(childText(locPrest, 'cMun')) : '';
  const ufPrest = municipioUF(childText(locPrest, 'cMun'));

  const servico: DanfseServico = {
    cTribNacFmt: formatCTribNac(cTribNacRaw),
    cTribMun,
    cNBSFmt: formatCNBS(childText(cServ, 'cNBS')),
    localPrestacao: joinLocation([
      xLocPrestacao || xMunPrest,
      ufPrest,
      cPaisPrestacao,
    ]),
    descricaoTributacao: xTribMun || xTribNac,
    xDescServ: childText(cServ, 'xDescServ'),
  };

  // ── ISSQN ──
  const exigSusp = childByLocalName(tribMun, 'exigSusp');
  const BM = childByLocalName(tribMun, 'BM');
  const xLocIncidValue = childText(tribMun, 'xLocIncid');
  const cPaisResult = childText(tribMun, 'cPaisResult');
  const ufIncid = municipioUF(childText(tribMun, 'cLocIncid'));
  const localIncidencia = joinLocation([xLocIncidValue, ufIncid, cPaisResult]);

  const tipoTribCode = childText(tribMun, 'tribISSQN');
  const vDescIncondNF = deepText(valNFSe, 'vDescIncond');
  const vCalcReeRepRes = deepText(ibscbsValores, 'vCalcReeRepRes');
  const vDR = deepText(valNFSe, 'vDedRed');
  const vCalcDR = deepText(valNFSe, 'vCalcDR');
  const totDeducoes = vDR
    ? formatMoney(vDR)
    : formatMoney(sumMoney(vCalcDR, vCalcReeRepRes));

  const issqn: DanfseIssqn = {
    tipoTrib: describeTribISSQN(tipoTribCode),
    localIncidencia,
    regimeEsp: describeRegEspTrib(childText(regTrib, 'regEspTrib')),
    tipoImunidade: describeTpImunidade(childText(tribMun, 'tpImunidade')),
    suspensao: describeTpSusp(childText(exigSusp, 'tpSusp')),
    nProcessoSusp: childText(exigSusp, 'nProcesso'),
    beneficioMun: describeTpBM(childText(valNFSe, 'tpBM')),
    calculoBM: childText(valNFSe, 'vCalcBM') || childText(BM, 'vRedBCBM'),
    totalDeducoes: totDeducoes,
    descIncond: formatMoney(vDescIncondNF),
    vBC: formatMoney(deepText(valNFSe, 'vBC')),
    pAliqAplic: formatPercent(deepText(valNFSe, 'pAliqAplic')),
    retencao: describeTpRetISSQN(childText(tribMun, 'tpRetISSQN')),
    vISSQN: formatMoney(deepText(valNFSe, 'vISSQN')),
    // Sem ISSQN: cStat ≠ 100 ou tipoTrib ∈ {2,3,4}; o layout fica simplificado.
    semIncidencia: !tribMun || tipoTribCode === '4' || tipoTribCode === '2',
  };

  // ── Federal (Nota 6: oculto após 2026) ──
  const competencia = dados.competencia;
  const competenciaAno = /^(\d{4})/.exec(competencia)?.[1];
  const ano = competenciaAno ? Number.parseInt(competenciaAno, 10) : null;

  const federal: DanfseFederal = {
    vIRRF: formatMoney(childText(tribFed, 'vRetIRRF')),
    vRetCP: formatMoney(childText(tribFed, 'vRetCP')),
    vRetCSLL: formatMoney(childText(tribFed, 'vRetCSLL')),
    vPIS: formatMoney(childText(piscofins, 'vPis')),
    vCOFINS: formatMoney(childText(piscofins, 'vCofins')),
    tpRetPisCofins: describeTpRetPisCofins(childText(piscofins, 'tpRetPisCofins')),
    ativo: ano == null || ano <= 2026,
  };

  // ── IBS/CBS ──
  const cIndOp = childText(ibscbsDPS, 'cIndOp');
  const cLocalidadeIncid = childText(ibscbsDPS, 'cLocalidadeIncid');
  const xLocalidadeIncid = childText(ibscbsDPS, 'xLocalidadeIncid');
  const ibsCST = deepText(ibscbsValores, 'CST');
  const ibsCClassTrib = deepText(ibscbsValores, 'cClassTrib');

  const exclusoesReducoes = formatMoney(
    sumMoney(
      vDescIncondNF,
      vCalcReeRepRes,
      deepText(valNFSe, 'vISSQN'),
      deepText(piscofins, 'vPis'),
      deepText(piscofins, 'vCofins'),
    ),
  );

  const ibscbs: DanfseIBSCBS = {
    cstCClassTrib: joinLocation([ibsCST, ibsCClassTrib]),
    indOpLocalidade: joinLocation([
      cIndOp,
      cLocalidadeIncid,
      xLocalidadeIncid,
      municipioUF(cLocalidadeIncid),
    ]),
    exclusoesReducoes,
    vBCAposExclusoes: formatMoney(childText(ibscbsValores, 'vBC')),
    redAliq: joinLocation([
      formatPercent(childText(ibscbsValoresUF, 'pRedAliqUF')),
      formatPercent(childText(ibscbsValoresMun, 'pRedAliqMun')),
      formatPercent(childText(ibscbsValoresFed, 'pRedAliqCBS')),
    ]),
    aliqIBS: joinLocation([
      formatPercent(childText(ibscbsValoresUF, 'pIBSUF')),
      formatPercent(childText(ibscbsValoresMun, 'pIBSMun')),
    ]),
    pAliqEfetMun: formatPercent(childText(ibscbsValoresMun, 'pAliqEfetMun')),
    vIBSMun: formatMoney(childText(gIBSMunTot, 'vIBSMun')),
    pAliqEfetUF: formatPercent(childText(ibscbsValoresUF, 'pAliqEfetUF')),
    vIBSUF: formatMoney(childText(gIBSUFTot, 'vIBSUF')),
    vIBSTot: formatMoney(childText(gIBS, 'vIBSTot')),
    pCBS: formatPercent(childText(ibscbsValoresFed, 'pCBS')),
    pAliqEfetCBS: formatPercent(childText(ibscbsValoresFed, 'pAliqEfetCBS')),
    vCBS: formatMoney(childText(gCBS, 'vCBS')),
  };

  // ── Totais ──
  const vServ = deepText(valNFSe, 'vServ');
  const vLiq = deepText(valNFSe, 'vLiq');
  const vDescCondIncond = childByLocalName(valNFSe, 'vDescCondIncond');
  const totIBSCBS = formatMoney(
    sumMoney(childText(gIBS, 'vIBSTot'), childText(gCBS, 'vCBS')),
  );
  const vTotNF = childText(totCIBS, 'vTotNF');

  const totais: DanfseTotais = {
    vServ: formatMoney(vServ),
    vDescIncond: formatMoney(
      vDescIncondNF || childText(vDescCondIncond, 'vDescIncond'),
    ),
    vDescCond: formatMoney(
      deepText(valNFSe, 'vDescCond') || childText(vDescCondIncond, 'vDescCond'),
    ),
    vTotalRet: formatMoney(deepText(valNFSe, 'vTotalRet')),
    vLiq: formatMoney(vLiq),
    vIBSCBSTot: totIBSCBS,
    vTotNF: formatMoney(vTotNF || vLiq),
  };

  // ── Informações complementares ──
  const obra = childByLocalName(serv, 'obra');
  const atvEvento = childByLocalName(serv, 'atvEvento');
  const imovel = childByLocalName(ibscbsDPS, 'imovel');
  const infoCompl = childByLocalName(serv, 'infoCompl');
  const gItemPed = childByLocalName(infoCompl, 'gItemPed');
  const substNode = childByLocalName(infDPS, 'subst');
  const totaisAproxNode = childByLocalName(trib, 'totTrib');
  const info: DanfseInfo = {
    linhas: buildInfoLines({
      xInfComp: childText(infoCompl, 'xInfComp'),
      chSubstda: childText(substNode, 'chSubstda'),
      docRef: deepText(infDPS, 'docRef'),
      cObra: childText(obra, 'cObra'),
      inscImobFisc: childText(imovel, 'inscImobFisc'),
      idAtvEvt: childText(atvEvento, 'idAtvEvt'),
      idDocTec: deepText(infDPS, 'idDocTec'),
      xPed: childText(infoCompl, 'xPed'),
      xItemPed: childText(gItemPed, 'xItemPed'),
      xOutInf: deepText(infDPS, 'xOutInf'),
      totaisAprox: {
        fed: childText(totaisAproxNode, 'vTotTribFed') || childText(totTrib, 'vTotTribFed'),
        est: childText(totaisAproxNode, 'vTotTribEst') || childText(totTrib, 'vTotTribEst'),
        mun: childText(totaisAproxNode, 'vTotTribMun') || childText(totTrib, 'vTotTribMun'),
        sn:
          childText(totaisAproxNode, 'pTotTribSN') ||
          childText(totTrib, 'pTotTribSN') ||
          deepText(valDPS, 'pTotTribSN'),
      },
    }),
  };

  // ── Prestador adicionais: Simples Nacional + Regime Apuração ──
  const extraPrestador: DanfseExtraPrestador = {
    simples: describeOpSimpNac(childText(regTrib, 'opSimpNac')),
    regApSN: describeRegApTribSN(childText(regTrib, 'regApTribSN')),
  };

  // ── Marca d'água ──
  const cStat = childText(infNFSe, 'cStat');
  let marcaDagua: DanfseMarkType = '';
  if (options.evento?.tipo) marcaDagua = options.evento.tipo;
  else if (cStat === '101') marcaDagua = 'CANCELADA';
  else if (cStat === '102') marcaDagua = 'SUBSTITUÍDA';

  return {
    chave,
    marcaDagua,
    competenciaAno: ano,
    header,
    dados,
    prestador: prestadorParty,
    extraPrestador,
    tomador,
    destinatario,
    intermediario,
    servico,
    issqn,
    federal,
    ibscbs,
    totais,
    info,
  };
}
