#!/usr/bin/env node
/**
 * Pack the production `dist/` folder into a Chrome Web Store-ready .zip,
 * or pack the obfuscated `dist-beta/` folder for a private tester.
 *
 * Output:
 *   Default:  `dist-zip/baixar-nfse-v<version>.zip`
 *   --beta:   `dist-zip/baixar-nfse-v<version>-beta.zip`
 *
 * Excluded by default:
 *   - `*.map`  (source maps add weight and are useless for the store)
 *   - `.DS_Store`, `Thumbs.db`
 *
 * Flags:
 *   --with-sourcemaps   Include .map files (internal QA builds).
 *   --beta              Pack dist-beta/ instead of dist/, with `-beta` suffix.
 *                       Implies sourcemaps stripped (the beta build doesn't
 *                       emit them anyway). NOT for upload to the Web Store.
 *
 * Usage:
 *   node scripts/zip.mjs
 *   node scripts/zip.mjs --with-sourcemaps
 *   node scripts/zip.mjs --beta
 */

import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZipArchive } from 'archiver';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const args = new Set(process.argv.slice(2));
const includeSourceMaps = args.has('--with-sourcemaps');
const isBeta = args.has('--beta');

const distDirName = isBeta ? 'dist-beta' : 'dist';
const distDir = resolve(projectRoot, distDirName);
const outDir = resolve(projectRoot, 'dist-zip');

if (!existsSync(distDir)) {
  const buildCmd = isBeta ? 'npm run build:beta' : 'npm run build';
  const packCmd = isBeta ? 'npm run pack:beta' : 'npm run pack';
  console.error(
    `\n  ${distDirName}/ not found. Run \`${buildCmd}\` first (or \`${packCmd}\`,\n  which builds and zips in one step).\n`,
  );
  process.exit(1);
}

const pkgRaw = await readFile(resolve(projectRoot, 'package.json'), 'utf8');
const pkg = JSON.parse(pkgRaw);
const version = pkg.version || '0.0.0';

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const suffix = isBeta ? '-beta' : '';
const outFile = resolve(outDir, `baixar-nfse-v${version}${suffix}.zip`);
const output = createWriteStream(outFile);
const archive = new ZipArchive({ zlib: { level: 9 } });

output.on('close', () => {
  const bytes = archive.pointer();
  const kb = (bytes / 1024).toFixed(1);
  const mb = (bytes / 1024 / 1024).toFixed(2);
  console.log(`\n  ✓ Zipped ${kb} kB (${mb} MB)`);
  console.log(`    → ${outFile}`);

  if (isBeta) {
    console.log('    (BETA build — obfuscated, do NOT upload to the Chrome Web Store)');
    console.log('    Deliver as unpacked extension: chrome://extensions → Load unpacked.');
  } else {
    console.log(
      includeSourceMaps
        ? '    (.map files INCLUDED — internal build, do NOT upload to the store)'
        : '    (.map files excluded — ready to upload to the Chrome Web Store)',
    );
  }

  if (bytes < 50 * 1024) {
    console.warn('\n  ⚠ Less than 50 kB — did the build produce real assets?');
  } else if (bytes > 20 * 1024 * 1024) {
    console.warn('\n  ⚠ Over 20 MB — the Web Store soft limit is 100 MB but reviewers');
    console.warn('    flag oversized packages. Consider stripping unused PrimeReact CSS.');
  }
});

archive.on('warning', (err) => {
  if (err.code === 'ENOENT') {
    console.warn('  warn:', err.message);
  } else {
    throw err;
  }
});
archive.on('error', (err) => { throw err; });

archive.pipe(output);

// Beta build never ships .map files (vite.config.ts disables sourcemaps in
// beta mode), but we still exclude them defensively in case stale artifacts
// linger in dist-beta/.
const stripMaps = isBeta || !includeSourceMaps;

archive.glob('**/*', {
  cwd: distDir,
  dot: false,
  ignore: [
    ...(stripMaps ? ['**/*.map'] : []),
    '**/.DS_Store',
    '**/Thumbs.db',
  ],
});

console.log(`\n  Packing ${distDirName}/ → ${outFile}`);
console.log(`  Version: ${version}${suffix}`);
console.log(`  Source maps: ${stripMaps ? 'excluded' : 'included'}`);
console.log(`  Mode: ${isBeta ? 'BETA (obfuscated, private)' : 'PRODUCTION (Web Store)'}`);

if (existsSync(distDir)) {
  const s = statSync(distDir);
  console.log(`  ${distDirName}/ mtime: ${s.mtime.toISOString()}`);
}

await archive.finalize();
