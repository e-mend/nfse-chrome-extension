// Code-to-description lookups used by the DANFSe layout. The NT-008 layout
// table mandates the *description* of each option, never the bare numeric
// code (see §6 "Convenções de Formatação de Dados"). Centralising the
// mappings here keeps the layout file free of magic strings.

const lookup =
  (table: Record<string, string>, fallback = '') =>
  (code: string | number | null | undefined): string => {
    const key = String(code ?? '').trim();
    if (!key) return fallback;
    return table[key] ?? key;
  };

// §6.1 - ambGer: 1=Produção, 2=Restrita
export const describeAmbGer = lookup({
  '1': 'Produção',
  '2': 'Restrita',
});

// §6.1 - tpAmb (DPS): 1=Produção, 2=Homologação
export const describeTpAmb = lookup({
  '1': 'Produção',
  '2': 'Homologação',
});

// §6.2 - tpEmit (DPS): 1=Prestador, 2=Tomador, 3=Intermediário
export const describeTpEmit = lookup({
  '1': 'Prestador',
  '2': 'Tomador',
  '3': 'Intermediário',
});

// §6.2 - cStat: full table is huge; the DANFSe just needs a friendly
// fallback. 100 is the only "happy path" we render literally.
export const describeCStat = (code: string | number | null | undefined): string => {
  const key = String(code ?? '').trim();
  if (!key) return '';
  if (key === '100') return 'Autorizada';
  if (key === '101') return 'Cancelada';
  if (key === '102') return 'Substituída';
  return `Situação ${key}`;
};

// §6.2 - finNFSe: 1=Normal, 2=Complementar, 3=Substituição, 4=…
export const describeFinNFSe = lookup({
  '1': 'NFS-e Normal',
  '2': 'NFS-e Complementar',
  '3': 'NFS-e em Substituição',
  '4': 'Outras Finalidades',
});

// §6.3 - opSimpNac: 1=Não optante, 2=Optante - MEI, 3=Optante - ME/EPP
export const describeOpSimpNac = lookup({
  '1': 'Não Optante',
  '2': 'Optante - MEI',
  '3': 'Optante - ME/EPP',
});

// §6.3 - regApTribSN: 1=Regime único, 2=Federal pelo SN, 3=Por fora do SN
export const describeRegApTribSN = lookup({
  '1': 'Regime de apuração dos tributos federais e municipal pelo Simples Nacional',
  '2': 'Federal pelo SN e Municipal por fora',
  '3': 'Por fora do SN',
});

// §6.8 - tribISSQN: 1=Operação tributável, 2=Imunidade, 3=Exportação,
//                   4=Não incidência
export const describeTribISSQN = lookup({
  '1': 'Operação Tributável',
  '2': 'Imunidade',
  '3': 'Exportação',
  '4': 'Não Incidência',
});

// §6.8 - regEspTrib: 0=Nenhum, 1=Microempresário individual (MEI),
//                    2=Estimativa, 3=Sociedade de profissionais,
//                    4=Cooperativa, 5=ME/EPP - Optante SN,
//                    6=ME/EPP - Não optante SN, 9=Outros
export const describeRegEspTrib = lookup({
  '0': 'Nenhum',
  '1': 'Microempresário individual (MEI)',
  '2': 'Estimativa',
  '3': 'Sociedade de profissionais',
  '4': 'Cooperativa',
  '5': 'ME/EPP - Optante SN',
  '6': 'ME/EPP - Não optante SN',
  '9': 'Outros',
});

// §6.8 - tpImunidade: 1..5
export const describeTpImunidade = lookup({
  '1': 'Patrimônio, renda ou serviços (templos)',
  '2': 'Patrimônio, renda ou serviços (partidos, sindicatos)',
  '3': 'Livros, jornais, periódicos e papel',
  '4': 'Fonogramas e videofonogramas musicais',
  '5': 'Outros',
});

// §6.8 - tpSusp
export const describeTpSusp = lookup({
  '1': 'Exigibilidade Suspensa por Decisão Judicial',
  '2': 'Exigibilidade Suspensa por Processo Administrativo',
});

// §6.8 - tpBM (benefício municipal)
export const describeTpBM = lookup({
  '1': 'Isenção',
  '2': 'Redução de Base de Cálculo',
  '3': 'Redução de Alíquota',
  '4': 'Outros',
});

// §6.8 - tpRetISSQN: 1=Não Retido, 2=Retido pelo Tomador,
//                     3=Retido pelo Intermediário
export const describeTpRetISSQN = lookup({
  '1': 'Não Retido',
  '2': 'Retido pelo Tomador',
  '3': 'Retido pelo Intermediário',
});

// §6.9 - tpRetPisCofins (10 opções, 1-9 + outros)
export const describeTpRetPisCofins = lookup({
  '1': 'PIS/COFINS/CSLL Não Retido',
  '2': 'PIS/COFINS Retido',
  '3': 'CSLL Retido',
  '4': 'PIS Retido',
  '5': 'COFINS Retido',
  '6': 'PIS/COFINS/CSLL Retido',
  '7': 'PIS/CSLL Retido',
  '8': 'COFINS/CSLL Retido',
  '9': 'Outros',
});
