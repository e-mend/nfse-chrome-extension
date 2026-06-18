// Formatting primitives used by the DANFSe layout. The NT-008 spec sets
// strict conventions: traços para vazio, dot-decimal in the XML rendered as
// pt-BR currency, dates as DD/MM/AAAA, IBGE codes broken into 3-pair groups,
// and so on. Keeping everything in one place lets the layout stay
// declarative.

// ─── Geometry helpers ──────────────────────────────────────────────────────

/** 1 cm in PostScript points (pdf-lib's native unit). */
export const CM_PT = 28.346456692913385;

/** Convert centimeters to pdf-lib points. */
export const cm = (value: number): number => value * CM_PT;

/**
 * A4 portrait in points. Hard-coded so the layout file never has to think
 * about which `PageSizes` enum entry to pull from pdf-lib.
 */
export const A4_WIDTH = 595.28;
export const A4_HEIGHT = 841.89;

/**
 * pdf-lib's coordinate origin is the bottom-left corner. The NT-008 layout
 * tables measure `Sup` (Y) from the top of the page, so every field needs
 * `pageHeight - (sup * CM) - heightOfField`. This helper hides the inversion
 * from callers.
 */
export const topCmToY = (supCm: number, heightPt: number): number =>
  A4_HEIGHT - cm(supCm) - heightPt;

// ─── Field content helpers ─────────────────────────────────────────────────

/** Nota 12: replace empty values with a single dash. */
export const dash = (value: string | null | undefined): string => {
  const v = value == null ? '' : String(value).trim();
  return v ? v : '-';
};

/** Truncate with reticências when the value would overflow the field. */
export function truncate(value: string | null | undefined, max: number): string {
  const s = value == null ? '' : String(value);
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

/** Normalize whitespace then truncate. */
export function clip(value: string | null | undefined, max: number): string {
  const s = (value == null ? '' : String(value)).replace(/\s+/g, ' ').trim();
  return truncate(s, max);
}

/**
 * Greedy word-wrapping that respects an explicit max char count per line and
 * a max line count. Returns at most `maxLines`; the final line is truncated
 * with reticências when more text would have followed.
 */
export function wrap(value: string | null | undefined, max: number, maxLines: number): string[] {
  const text = (value == null ? '' : String(value)).replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const words = text.split(' ');
  const out: string[] = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length > max) {
      if (cur) out.push(cur);
      cur = word;
      if (out.length === maxLines) break;
    } else {
      cur = next;
    }
  }
  if (cur && out.length < maxLines) out.push(cur);
  if (out.length === maxLines && words.join(' ').length > out.join(' ').length) {
    const last = out[maxLines - 1];
    out[maxLines - 1] = truncate(last, max);
  }
  return out;
}

// ─── Numbers / values ──────────────────────────────────────────────────────

/** Parse "1234.50" → 1234.5; returns NaN for empty/garbage. */
export function parseNumber(value: string | number | null | undefined): number {
  if (value == null || value === '') return Number.NaN;
  if (typeof value === 'number') return value;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Convenção §5: 1-15V2 monetário renderizado como "R$ 1.234,56". */
export function formatMoney(value: string | number | null | undefined): string {
  const n = parseNumber(value);
  if (!Number.isFinite(n)) return '';
  return `R$ ${n.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Convenção §5: 1-2V2 percentual renderizado como "12,34%". */
export function formatPercent(value: string | number | null | undefined): string {
  const n = parseNumber(value);
  if (!Number.isFinite(n)) return '';
  return `${n.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

/**
 * Sum a list of monetary values. Returns NaN when *every* entry is empty —
 * letting the caller distinguish "no value at all" (render as `-`) from a
 * genuine R$ 0,00.
 */
export function sumMoney(...values: Array<string | number | null | undefined>): number {
  let total = 0;
  let any = false;
  for (const v of values) {
    const n = parseNumber(v);
    if (Number.isFinite(n)) {
      total += n;
      any = true;
    }
  }
  return any ? total : Number.NaN;
}

// ─── Dates ─────────────────────────────────────────────────────────────────

/** "2026-05-12" or "2026-05-12T..." → "12/05/2026". Pass-through on failure. */
export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** "2026-05-12T08:30:15" → "12/05/2026 08:30:15". Pass-through on failure. */
export function formatDateTimeBR(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):?(\d{2})?/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}:${m[6] ?? '00'}` : iso;
}

// ─── Docs / phones / CEP ───────────────────────────────────────────────────

export function formatDoc(raw: string | null | undefined): string {
  const d = (raw ?? '').replace(/\D/g, '');
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return raw ?? '';
}

export function formatPhone(raw: string | null | undefined): string {
  const d = (raw ?? '').replace(/\D/g, '');
  if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  return raw ?? '';
}

export function formatCep(raw: string | null | undefined): string {
  const d = (raw ?? '').replace(/\D/g, '');
  return d.length === 8 ? d.replace(/^(\d{5})(\d{3})$/, '$1-$2') : (raw ?? '');
}

/** Código de Tributação Nacional (6 dígitos) → "06.01.02". */
export function formatCTribNac(raw: string | null | undefined): string {
  const d = (raw ?? '').replace(/\D/g, '');
  if (d.length === 6) return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4, 6)}`;
  return raw ?? '';
}

/** Código NBS (7 dígitos) → "1.0101.10.00" (legacy convenção 1-NNNN-NN-NN). */
export function formatCNBS(raw: string | null | undefined): string {
  const d = (raw ?? '').replace(/\D/g, '');
  if (d.length === 7) {
    return `${d.slice(0, 1)}.${d.slice(1, 5)}.${d.slice(5, 7)}`;
  }
  if (d.length === 9) {
    return `${d.slice(0, 1)}.${d.slice(1, 5)}.${d.slice(5, 7)}.${d.slice(7, 9)}`;
  }
  return raw ?? '';
}

/**
 * Pretty-print "Município / UF" optionally followed by "/ País" — used by
 * the "Local da Prestação" / "Município Incidência" fields. Skips empty
 * segments so a city without a UF still renders cleanly.
 */
export function joinLocation(parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => (p == null ? '' : String(p).trim()))
    .filter((p) => p.length > 0)
    .join(' / ');
}

/** "Logradouro, nº, complemento, bairro" with empty parts elided. */
export function joinAddress(parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => (p == null ? '' : String(p).trim()))
    .filter((p) => p.length > 0)
    .join(', ');
}
