// Public surface of the DANFSe module. Two entry points:
//
// 1. `generateDanfsePdf(xml, opts?)` — parses + builds the PDF in one go,
//    handy for the "Baixar PDF" button in the notas table.
// 2. `parseDanfse` / `parseEvento` / `buildDanfsePdf` — lower-level
//    primitives for callers that need to compose differently (e.g. apply
//    a precomputed marca d'água from a separate events store).
//
// The module reads the NFS-e logo as a runtime URL fetch so the PDF
// always carries the official image without forcing the bundle to ship
// the binary inline.

import { buildDanfsePdf, type BuildDanfseDeps } from './buildDanfsePdf';
import { parseDanfse, parseEvento, type DanfseData, type DanfseEvento } from './parseDanfse';

export type { DanfseData, DanfseEvento } from './parseDanfse';
export type { BuildDanfseDeps } from './buildDanfsePdf';
export { buildDanfsePdf, parseDanfse, parseEvento };

/**
 * Resolve the extension-relative URL for the NFS-e logo PNG. Falls back to
 * a relative path when the API isn't available (vite preview / unit tests).
 */
function chromeRuntimeUrl(path: string): string {
  const runtime = (globalThis as { chrome?: typeof chrome }).chrome?.runtime;
  if (runtime?.getURL) return runtime.getURL(path);
  return `/${path.replace(/^\/+/, '')}`;
}

let logoBytesPromise: Promise<Uint8Array | null> | null = null;

async function loadLogoBytes(): Promise<Uint8Array | null> {
  if (logoBytesPromise) return logoBytesPromise;
  logoBytesPromise = (async () => {
    try {
      const response = await fetch(chromeRuntimeUrl('icons/nfse-logo.png'));
      if (!response.ok) return null;
      const buf = await response.arrayBuffer();
      return new Uint8Array(buf);
    } catch (err) {
      console.warn('[DANFSe] failed to load NFSe logo', err);
      return null;
    }
  })();
  return logoBytesPromise;
}

export interface GenerateDanfseOptions {
  /** Evento opcional que controla a marca d'água (cancelada / substituída). */
  evento?: DanfseEvento | null;
  /** Permite injetar bytes do logo (testes); default = fetch da extensão. */
  logoBytes?: Uint8Array | null;
}

export interface GenerateDanfseResult {
  bytes: Uint8Array;
  /** Os dados estruturados que produziram o PDF — útil pra exibir resumo. */
  data: DanfseData;
}

/** End-to-end: NFS-e XML → DANFSe PDF (Uint8Array). */
export async function generateDanfsePdf(
  xml: string,
  options: GenerateDanfseOptions = {},
): Promise<GenerateDanfseResult> {
  const data = parseDanfse(xml, { evento: options.evento ?? null });
  if (!data) {
    throw new Error('XML inválido para DANFSe (faltando infNFSe).');
  }
  const logoBytes =
    options.logoBytes !== undefined ? options.logoBytes : await loadLogoBytes();
  const deps: BuildDanfseDeps = { logoBytes };
  const bytes = await buildDanfsePdf(data, deps);
  return { bytes, data };
}

/** Build a sanitized PDF filename: `nNFSe-tail.pdf` or `nota-<chave>.pdf`. */
export function defaultDanfseFilename(data: DanfseData): string {
  const numero = (data.dados.nNFSe || '').trim();
  const tail = (data.chave || '').slice(-7);
  const stem = numero || data.chave || 'danfse';
  const suffix = tail ? `_${tail}` : '';
  const safe = `${stem}${suffix}`.replace(/[\/\\:*?"<>|]+/g, '_');
  return safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`;
}
