import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import obfuscator from 'rollup-plugin-obfuscator';
import manifest from './manifest.config';

// `--mode beta`  → obfuscated build for a private tester (NOT for the Chrome Web Store).
// `--mode production` (default for `vite build`) → clean, policy-compliant store build.
export default defineConfig(({ mode }) => {
  const isBeta = mode === 'beta';

  const plugins: PluginOption[] = [
    react(),
    crx({ manifest }),
  ];

  if (isBeta) {
    // Per-file obfuscation. Scoped to our own logic so PrimeReact/React/etc.
    // stay fast and the UI remains responsive.
    plugins.push(
      obfuscator({
        global: false,
        include: [
          'src/lib/**/*.{ts,tsx,js}',
          'src/background/**/*.{ts,js}',
          'src/db/**/*.{ts,js}',
          'src/certificado/**/*.{ts,tsx}',
        ],
        exclude: [
          'node_modules/**',
          '**/*.css',
          '**/*.html',
        ],
        options: {
          compact: true,
          controlFlowFlattening: true,
          controlFlowFlatteningThreshold: 0.6,
          deadCodeInjection: true,
          deadCodeInjectionThreshold: 0.3,
          stringArray: true,
          stringArrayEncoding: ['base64'],
          stringArrayThreshold: 0.8,
          stringArrayWrappersCount: 2,
          stringArrayWrappersChainedCalls: true,
          stringArrayWrappersParametersMaxCount: 4,
          stringArrayWrappersType: 'function',
          identifierNamesGenerator: 'hexadecimal',
          renameGlobals: false,
          selfDefending: true,
          splitStrings: true,
          splitStringsChunkLength: 8,
          transformObjectKeys: true,
          numbersToExpressions: true,
          simplify: true,
          target: 'browser',
          // Anything matching these patterns is left untouched. The Chrome
          // extension globals are property accesses so they survive anyway,
          // but we make it explicit.
          reservedNames: ['^chrome$', '^browser$'],
          reservedStrings: ['^chrome\\.', '^browser\\.'],
          // Intentionally NOT enabled:
          //  - debugProtection: makes DevTools unusable, also flagged by reviewers
          //  - domainLock: extension URLs are dynamic per install, would break things
        },
      }),
    );
  }

  return {
    plugins,
    define: {
      __BETA__: JSON.stringify(isBeta),
    },
    build: {
      target: 'esnext',
      // Beta: no sourcemaps shipped. Store: 'hidden' keeps maps off the .js
      // but lets the zip script include or strip them as needed.
      sourcemap: isBeta ? false : 'hidden',
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: isBeta,
          drop_debugger: true,
          passes: 2,
        },
        mangle: {
          toplevel: true,
        },
        format: {
          comments: false,
        },
      },
      outDir: isBeta ? 'dist-beta' : 'dist',
      rollupOptions: {
        input: {
          certificado: 'src/certificado/index.html',
        },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      hmr: {
        port: 5173,
      },
    },
  };
});
