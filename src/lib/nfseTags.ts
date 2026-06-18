/**
 * Nomes dos elementos / atributos do XML da NFS-e Nacional.
 * Centralizado num enum pra evitar literais espalhados pelo parser.
 *
 * Schema rev: 2948-0155-ccdl (compatível com layout Nacional + Reforma Tributária).
 */
export enum NfseTag {
  // ── Containers ────────────────────────────────────────────────────────────
  TAG_INF_NFSE = 'infNFSe',
  TAG_DPS = 'DPS',
  TAG_INF_DPS = 'infDPS',
  TAG_INF_EVENTO = 'infEvento',
  TAG_VALORES = 'valores',
  TAG_SUBST = 'subst',

  // ── Partes ───────────────────────────────────────────────────────────────
  TAG_EMIT = 'emit',
  TAG_PREST = 'prest',
  TAG_TOMA = 'toma',
  TAG_TOMADOR = 'tomador',

  // ── Identificação ────────────────────────────────────────────────────────
  TAG_CNPJ = 'CNPJ',
  TAG_CPF = 'CPF',
  TAG_NIF = 'NIF',
  TAG_CAEPF = 'CAEPF',
  TAG_IM = 'IM',
  TAG_CNPJ_AUTOR = 'CNPJAutor',

  // ── Nomes ────────────────────────────────────────────────────────────────
  TAG_X_NOME = 'xNome',
  TAG_X_FANT = 'xFant',
  TAG_X_RAZ_SOC = 'xRazSoc',

  // ── Numeração / série ────────────────────────────────────────────────────
  TAG_N_NFSE = 'nNFSe',
  TAG_N_DPS = 'nDPS',
  TAG_N_DFSE = 'nDFSe',
  TAG_SERIE = 'serie',

  // ── Datas ────────────────────────────────────────────────────────────────
  TAG_DH_EMI = 'dhEmi',
  TAG_DH_PROC = 'dhProc',
  TAG_DH_EVENTO = 'dhEvento',
  TAG_D_COMPET = 'dCompet',

  // ── Status / ambiente / aplicativo ───────────────────────────────────────
  TAG_C_STAT = 'cStat',
  TAG_TP_AMB = 'tpAmb',
  TAG_AMB_GER = 'ambGer',
  TAG_TP_EMIS = 'tpEmis',
  TAG_PROC_EMI = 'procEmi',
  TAG_VER_APLIC = 'verAplic',

  // ── Localidades (códigos IBGE 7 dígitos + descrições) ────────────────────
  TAG_C_LOC_EMI = 'cLocEmi',
  TAG_X_LOC_EMI = 'xLocEmi',
  TAG_C_LOC_PRESTACAO = 'cLocPrestacao',
  TAG_X_LOC_PRESTACAO = 'xLocPrestacao',
  TAG_C_LOC_INCID = 'cLocIncid',
  TAG_X_LOC_INCID = 'xLocIncid',
  TAG_C_MUN = 'cMun',
  TAG_X_MUN_INC = 'xMunInc',
  TAG_UF = 'UF',

  // ── Serviço / classificação ──────────────────────────────────────────────
  TAG_X_DESC_SERV = 'xDescServ',
  TAG_C_TRIB_NAC = 'cTribNac',
  TAG_X_TRIB_NAC = 'xTribNac',
  TAG_C_TRIB_MUN = 'cTribMun',
  TAG_X_TRIB_MUN = 'xTribMun',
  TAG_C_NBS = 'cNBS',
  TAG_X_NBS = 'xNBS',

  // ── Valores principais ───────────────────────────────────────────────────
  TAG_V_SERV = 'vServ',
  TAG_V_LIQ = 'vLiq',
  TAG_V_NF = 'vNF',
  TAG_V_BC = 'vBC',
  TAG_P_ALIQ_APLIC = 'pAliqAplic',
  TAG_V_ISSQN = 'vISSQN',
  TAG_V_ISS = 'vISS',
  TAG_V_TOTAL_RET = 'vTotalRet',

  // ── Reforma Tributária (IBS / CBS) ───────────────────────────────────────
  TAG_V_TOT_NF = 'vTotNF',
  TAG_V_IBS_TOT = 'vIBSTot',
  TAG_V_CBS = 'vCBS',

  // ── Retenções (variantes de nome em diferentes leiautes) ─────────────────
  TAG_TP_RET_ISSQN = 'tpRetISSQN',
  TAG_V_RET_IRRF = 'vRetIRRF',
  TAG_V_IRRF = 'vIRRF',
  TAG_V_IR = 'vIR',
  TAG_V_RET_PIS = 'vRetPIS',
  TAG_V_PIS_LOWER = 'vPis',
  TAG_V_PIS = 'vPIS',
  TAG_V_RET_COFINS = 'vRetCOFINS',
  TAG_V_COFINS_LOWER = 'vCofins',
  TAG_V_COFINS = 'vCOFINS',
  TAG_V_RET_CSLL = 'vRetCSLL',
  TAG_V_CSLL = 'vCSLL',
  TAG_V_RET_CP = 'vRetCP',
  TAG_V_RET_INSS = 'vRetINSS',
  TAG_V_INSS = 'vINSS',
  TAG_V_CP = 'vCP',

  // ── Substituição ─────────────────────────────────────────────────────────
  TAG_CH_SUBSTDA = 'chSubstda',
  TAG_C_MOTIVO = 'cMotivo',

  // ── Eventos ──────────────────────────────────────────────────────────────
  TAG_CH_NFSE = 'chNFSe',
  TAG_CH_NFSE_REJ = 'chNFSeRej',
  TAG_X_DESC = 'xDesc',
  TAG_X_MOTIVO = 'xMotivo',

  // ── Outros ───────────────────────────────────────────────────────────────
  TAG_X_OUT_INF = 'xOutInf',
  ATTR_ID = 'Id',
}
