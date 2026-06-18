/**
 * Configurable file-naming for downloaded documents (PDF/XML).
 *
 * The user picks a pattern in the "Configurações" tab — either one of the
 * presets or a free-form template — and every download interpolates the
 * tokens below against the nota's parsed `meta`. Empty tokens collapse so a
 * pattern like `{numero}_{prestador}` never leaves a dangling separator.
 */
import type { NfseMeta } from './useXml';

/** A token usable inside a naming pattern, e.g. `{numero}`. */
export interface NamingToken {
  /** Token name without braces. */
  key: string;
  /** Short human label for the help panel. */
  label: string;
  /** Resolve the token's value from the nota meta + NSU. */
  resolve: (meta: NfseMeta, nsu: number) => string;
}

/** Last `n` chars of a string (empty-safe). */
function tail(value: string, n: number): string {
  return value ? value.slice(-n) : '';
}

export const NAMING_TOKENS: NamingToken[] = [
  {
    key: 'numero',
    label: 'Número da NFS-e (ou DPS)',
    resolve: (m) => (m.numeroNFSe || m.numeroDPS || '').trim(),
  },
  {
    key: 'data',
    label: 'Data de emissão (AAAA-MM-DD)',
    resolve: (m) => (m.dataEmissaoISO || '').trim(),
  },
  {
    key: 'competencia',
    label: 'Competência (AAAA-MM)',
    resolve: (m) => (m.competenciaMes || '').trim(),
  },
  {
    key: 'prestador',
    label: 'Nome do prestador',
    resolve: (m) => (m.prestador?.nome || '').trim(),
  },
  {
    key: 'prestadorDoc',
    label: 'CNPJ/CPF do prestador',
    resolve: (m) => (m.prestador?.doc || '').trim(),
  },
  {
    key: 'tomador',
    label: 'Nome do tomador',
    resolve: (m) => (m.tomador?.nome || '').trim(),
  },
  {
    key: 'tomadorDoc',
    label: 'CNPJ/CPF do tomador',
    resolve: (m) => (m.tomador?.doc || '').trim(),
  },
  {
    key: 'chave',
    label: 'Chave de acesso completa',
    resolve: (m) => (m.chave || m.chaveDPS || m.chaveReferenciada || '').trim(),
  },
  {
    key: 'chaveCurta',
    label: 'Final da chave (7 dígitos)',
    resolve: (m) => tail((m.chave || m.chaveDPS || m.chaveReferenciada || '').trim(), 7),
  },
  {
    key: 'tipo',
    label: 'Tipo do documento (NFSE/DPS/EVENTO)',
    resolve: (m) => m.tipoDocumento || '',
  },
  {
    key: 'nsu',
    label: 'NSU',
    resolve: (_m, nsu) => (nsu > 0 ? String(nsu) : ''),
  },
];

export interface NamingPreset {
  label: string;
  pattern: string;
}

/**
 * Pre-baked patterns offered in the settings dropdown. The first one is the
 * default and reproduces the legacy `numero_finalDaChave` filename.
 */
export const NAMING_PRESETS: NamingPreset[] = [
  { label: 'Número + final da chave (padrão)', pattern: '{numero}_{chaveCurta}' },
  { label: 'Número', pattern: '{numero}' },
  { label: 'Número + Data', pattern: '{numero}_{data}' },
  { label: 'Data + Número', pattern: '{data}_{numero}' },
  { label: 'Competência + Número', pattern: '{competencia}_{numero}' },
  { label: 'Número + Prestador', pattern: '{numero}_{prestador}' },
  { label: 'Prestador + Número + Data', pattern: '{prestador}_{numero}_{data}' },
  { label: 'Tipo + Número + Data', pattern: '{tipo}_{numero}_{data}' },
];

/** Default pattern when nothing is configured yet. */
export const DEFAULT_NAMING_PATTERN = NAMING_PRESETS[0].pattern;

const TOKEN_BY_KEY: Record<string, NamingToken> = Object.fromEntries(
  NAMING_TOKENS.map((t) => [t.key, t]),
);

/** Strip characters that are illegal in file names on Windows/macOS/Linux. */
function sanitizePart(value: string): string {
  return value
    .replace(/[\/\\:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Interpolate a pattern against a nota's meta. Unknown tokens are dropped, and
 * runs of separators left by empty tokens are collapsed so the result is always
 * a clean stem (no extension).
 */
export function buildFileStem(pattern: string, meta: NfseMeta, nsu: number): string {
  const raw = (pattern || DEFAULT_NAMING_PATTERN).replace(
    /\{(\w+)\}/g,
    (_match, key: string) => {
      const token = TOKEN_BY_KEY[key];
      return token ? sanitizePart(token.resolve(meta, nsu)) : '';
    },
  );

  const stem = sanitizePart(raw)
    // Collapse separators left behind by empty tokens (e.g. "_-_" or "__").
    .replace(/[\s_-]*[_-][\s_-]*/g, '_')
    .replace(/^[_\s-]+|[_\s-]+$/g, '');

  return stem;
}

/**
 * Build a complete filename (with extension) from a pattern. Falls back to the
 * provided `fallbackStem` when the pattern resolves to nothing (e.g. a doc with
 * no número and no chave).
 */
export function buildFileName(
  pattern: string,
  meta: NfseMeta,
  nsu: number,
  ext: string,
  fallbackStem: string,
): string {
  let stem = buildFileStem(pattern, meta, nsu);
  if (!stem) stem = sanitizePart(fallbackStem) || 'nota';
  const lower = ext.toLowerCase();
  return stem.toLowerCase().endsWith(`.${lower}`) ? stem : `${stem}.${lower}`;
}

/** A representative nota meta used to preview a pattern in the settings UI. */
export const SAMPLE_META = {
  tipoDocumento: 'NFSE',
  chave: '31250812345678000190000000000012345678901234',
  chaveDPS: '',
  numeroNFSe: '1024',
  numeroDPS: '',
  dataEmissaoISO: '2026-06-18',
  competenciaMes: '2026-06',
  prestadorDoc: '12345678000190',
  tomadorDoc: '98765432000100',
  prestador: { doc: '12345678000190', nome: 'Empresa Prestadora LTDA' },
  tomador: { doc: '98765432000100', nome: 'Cliente Tomador SA' },
} as unknown as NfseMeta;
