/** Strip non-digit characters from a CNPJ/CPF string. */
export function digits(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '');
}

/** Format a 14-digit CNPJ or 11-digit CPF for display. */
export function formatCnpjCpf(raw: string | null | undefined): string {
  const d = digits(raw);
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  return raw ?? '';
}

/** Brazilian datetime in long form: 12/06/2026 23:45. */
export function formatDateTimeBR(isoOrTs: string | number | null | undefined): string {
  if (isoOrTs == null) return '';
  const d = new Date(isoOrTs);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR');
}

/** YYYY-MM-DD in the user's local timezone (avoids the UTC shift of `toISOString`). */
export function localDateISO(d: Date | null | undefined): string {
  if (!d || Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Format a numeric string (as it appears in NFS-e XMLs, e.g. "1234.50") as
 * pt-BR currency: "R$ 1.234,50". Returns an empty string for null/empty/NaN.
 */
export function formatBRL(value: string | number | null | undefined): string {
  if (value == null || value === '') return '';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function extract(parent: Element, ...cels: string[]): string {
  for (const c of cels) {
    const text = parent.querySelector(c)?.textContent?.trim();
    if (text) return text;
  }
  return '';
}
