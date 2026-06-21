# Baixar NFSe — Certificado Digital (Chrome Extension)

Chrome (MV3) extension that downloads the **XML** and the **DANFSe (PDF)** of
your *Notas Fiscais de Serviço Eletrônica* (NFS-e) straight from the official
**ADN** API (`adn.nfse.gov.br`), authenticating with your **digital
certificate** — **no captcha, no portal scraping**. Everything is stored
locally in the browser; nothing is ever sent to a third party.

Built with React 19, PrimeReact 10, RxDB 17 (IndexedDB) and Vite 8 + `@crxjs/vite-plugin`.

---

## What it does

- **Conecta com o certificado digital.** Clicking *Conectar* fires an
  authenticated request to the ADN; Chrome shows its native certificate picker
  and the response tells us which CNPJ/CPF mailbox you have access to. There is
  no username/password and no captcha.
- **Detecta a empresa automaticamente.** The owner of the mailbox is inferred
  from the documents themselves (`detectOwner`) and saved as an *empresa*.
- **Sincroniza incrementalmente.** `runSync` walks the ADN by NSU cursor,
  resumes from where it stopped, persists every batch, and backs off on
  `429`/`5xx`. Multiple syncs queue up and report into a floating progress
  widget.
- **Guarda tudo localmente.** Every document becomes a row in a local RxDB
  (IndexedDB) `notas` collection — searchable, filterable and exportable
  offline.
- **Gera o XML e o DANFSe (PDF).** PDFs are built client-side with `pdf-lib`
  following *Nota Técnica nº 008 v1.0* (QR Code, logo and the "cancelada /
  substituída" watermark included).
- **Exporta para Excel.** A dependency-free `.xlsx` writer turns the filtered
  notas into a spreadsheet with money kept numeric so you can sum it straight
  away.
- **Relatório imprimível.** An HTML report grouped by empresa, ready to
  *Ctrl+P → Salvar como PDF*.
- **Preenche lacunas.** *Baixar faixa de NSU* re-fetches a `[De, Até]` window
  from the ADN and reports which NSUs are genuine ADN gaps vs. resumo-only.

## How it works

```
Chrome (você + certificado)
        │  fetch(..., { credentials: 'include' })  ← cert picker nativo
        ▼
adn.nfse.gov.br/contribuintes/DFe/{nsu}?lote=true   (useApi.pingADN)
        │  LoteDFe[] (XML gzip+base64)
        ▼
parseLote → NfseMeta (useXml)  ──►  RxDB `notas` (Dexie/IndexedDB)
        │
        ├─► DANFSe PDF (pdf-lib + qrcode)
        ├─► Excel .xlsx (lib/xlsx)
        └─► Relatório HTML (lib/relatorio)
```

- **`useApi.pingADN`** is the single ADN client: adaptive throttle, exponential
  backoff with `Retry-After`, a 15 s timeout, and the `forceZero` trick that
  opens a throwaway tab to coax Chrome into showing the certificate dialog.
- **`runSync` / `syncContext`** own the incremental sync: a job queue, abortable
  jobs, per-batch durability of the NSU cursor on the empresa row, and a
  resumable breadcrumb (`syncInterrupted`) so a closed tab can be continued.
- **RxDB + Dexie** keeps the local store reactive (the notas/empresas tables
  re-render the moment a sync writes), queryable (Mango selectors + indexes)
  and migratable (schema versioning).

## Stack

| Layer | Library |
|---|---|
| UI framework | React 19 |
| Component library | PrimeReact 10 (Lara Dark Teal theme) + PrimeFlex / PrimeIcons |
| Local DB | RxDB 17 with the Dexie storage adapter (IndexedDB-backed) |
| PDF (DANFSe) | `pdf-lib` + `qrcode` |
| Excel | hand-rolled OOXML writer (`src/lib/xlsx.ts`, no runtime dep) |
| Bundler | Vite 8 + `@vitejs/plugin-react` |
| Extension build | `@crxjs/vite-plugin` (MV3 manifest + HMR) |
| Beta obfuscation | `rollup-plugin-obfuscator` (`--mode beta` only) |
| Language | TypeScript 6 |

## The UI (tabs)

Left-rail navigation in `src/certificado/`. The active tabs are:

| Tab | Component | What's there |
|---|---|---|
| **Conexão** | `ConnectionTab` → `StepsCard` | Conectar (certificado), escolher pasta, sincronizar novos; live `SyncProgress`. |
| **Empresas** | `CompaniesTab` → `EmpresasCard` + `RelatorioCard` | Live table of connected empresas: edit the NSU cursor, sync / resync-from-zero / remove, and generate the printable relatório. |
| **Notas** | `NotasTab` → `NotasTable` | The main DataTable: search/date/tipo/empresa filters, show/hide columns, per-row XML + DANFSe download, bulk XML/PDF/Excel, and the *Baixar faixa de NSU* dialog. |
| **Configurações** | `SettingsTab` | PDF filename pattern (tokens + presets + live preview), container width, and a danger zone (apagar notas / apagar tudo). |
| **Sobre** | `AboutTab` | Open-source info, donation links, terms & privacy summary. |

> `BackupTab` and `DownloadTab` (the old `PostDownloadCard`) still exist in the
> tree but are **commented out** in `TabNavigation.tsx` — they're a future
> milestone, not wired into the navigation.

## Layout

```
chrome-extension/
├── manifest.config.ts          ← MV3 manifest as TS (consumed by @crxjs/vite-plugin)
├── vite.config.ts              ← prod + `--mode beta` (obfuscated) builds
├── scripts/zip.mjs             ← packs dist/ (or dist-beta/) into dist-zip/*.zip
├── public/icons/               ← icon16/48/128 + nfse-logo.png (embedded in the PDF)
├── src/
│   ├── background/index.ts     ← MV3 service worker (opens the certificado tab on icon click)
│   ├── db/
│   │   ├── index.tsx           ← RxDB factory + <DbProvider/> + getDatabase()
│   │   └── schemas/            ← empresa.ts · settings.ts · nota.ts (+ migrations)
│   ├── lib/
│   │   ├── useApi.ts           ← ADN client: pingADN, throttle/backoff, forceZero
│   │   ├── useXml.ts           ← gzip+XML decode → NfseMeta; NSU-range fetch
│   │   ├── runSync.ts          ← incremental, resumable NSU sync
│   │   ├── syncContext.tsx     ← <SyncProvider/>: job queue + floating progress
│   │   ├── detectOwner.ts      ← infer the mailbox owner from a batch
│   │   ├── danfse/             ← parseDanfse + buildDanfsePdf (NT-008 v1.0) + helpers
│   │   ├── relatorio.ts        ← printable HTML report
│   │   ├── xlsx.ts             ← dependency-free .xlsx writer
│   │   ├── fileNaming.ts       ← configurable PDF/XML filename tokens
│   │   ├── folderAccess.ts     ← File System Access dir handle (IndexedDB)
│   │   └── format · layout · status · progress · useSettings · useToast · types …
│   ├── styles/global.css       ← CSS variables + base classes
│   └── certificado/
│       ├── index.html · main.tsx   ← entry; mounts providers (PrimeReact → DbProvider → SyncProvider)
│       ├── CertificadoApp.tsx      ← orchestrator / page layout
│       └── components/             ← TabNavigation + the tab/card components above
```

## Scripts

```bash
npm install
npm run dev          # Vite dev server + extension auto-reload (HMR) → dev build
npm run build        # type-check, then production build into ./dist
npm run build:beta   # type-check, then OBFUSCATED build into ./dist-beta (private testers)
npm run typecheck    # tsc --noEmit
npm run zip          # zip ./dist → ./dist-zip/baixar-nfse-v<version>.zip  (no .map — store-ready)
npm run zip:internal # same, but INCLUDES .map files (internal QA only)
npm run zip:beta     # zip ./dist-beta → ./dist-zip/baixar-nfse-v<version>-beta.zip
npm run pack         # build && zip          (one-shot, store build)
npm run pack:beta    # build:beta && zip:beta (one-shot, obfuscated build)
npm run clean        # rm -rf dist dist-beta dist-zip .vite
```

### Build modes

| Mode | Output | Notes |
|---|---|---|
| `production` (default `vite build`) | `dist/` | Terser minify, hidden sourcemaps, **no obfuscation** — policy-compliant for the Chrome Web Store. RxDB dev-mode + schema validation are stripped. |
| `beta` (`vite build --mode beta`) | `dist-beta/` | Per-file obfuscation of our own `src/**` (PrimeReact/React left untouched), `drop_console`, no sourcemaps. **Private side-loaded testers only — do NOT upload to the Web Store.** |

> In DEV the RxDB dev-mode plugin uses the **z-schema** validator on purpose:
> ajv / is-my-json-valid compile via `new Function(...)`, which Chrome blocks
> under the MV3 extension CSP (`unsafe-eval`). The validator ships only in DEV.

## Test it in Chrome (load unpacked)

1. Build once, or run `npm run dev` and leave it running for HMR:

   ```bash
   npm run build   # produces ./dist
   # or, for live reload while you edit React components:
   npm run dev
   ```

2. Open `chrome://extensions`.
3. Top-right toggle: enable **Modo de desenvolvedor** (Developer mode).
4. Click **Carregar sem compactação** (Load unpacked).
5. Select the **`dist/`** folder (NOT the project root).
6. Click the extension icon → the *certificado* page opens in a new tab.

### When you edit code

| With… | What happens |
|---|---|
| `npm run dev` running | React components hot-reload in the open tab. Changing `manifest.config.ts` or `background/index.ts` auto-reloads the whole extension. |
| `npm run build` (one-shot) | Click the **↻** (reload) button on the extension card in `chrome://extensions` after every rebuild. |

### Common gotchas

- **Path with spaces / `&`**: the project folder contains a space and an `&`.
  Always quote it in the shell. `npm` itself is fine.
- **Service worker disappears**: Chrome unloads MV3 service workers after ~30 s
  of inactivity. That's normal — clicking the icon wakes it up.
- **Certificate dialog doesn't show**: the first `Conectar` may need the
  `forceZero` fallback (it opens a throwaway tab so Chrome surfaces the cert
  picker). If the popup times out, close it and click *Conectar* again.
- **Hard reset**: remove the extension and re-load it. RxDB data lives in
  IndexedDB under the extension's origin, so removing it wipes the local DB.
  (Or use **Configurações → Apagar todos os dados**.)

## Manifest & permissions

`manifest.config.ts` reads `version`, `name`, etc. from `package.json` at build
time. Permissions declared:

| Permission | Why |
|---|---|
| `unlimitedStorage` | local IndexedDB store (notas, empresas, preferences) can exceed the default quota. |
| `host_permissions` `nfse.gov.br` / `adn.nfse.gov.br` | the official services the user queries. |

XML/PDF/Excel files are saved through the browser's standard download flow (a
synthetic `<a download>` click), so **no `downloads` permission is required**.

## Generate a `.zip` for the Chrome Web Store

```bash
npm run pack
# → dist-zip/baixar-nfse-v<version>.zip
```

The Web Store accepts a `.zip` upload (it generates and signs the `.crx`
server-side). **Use the production build (`dist/`), never the obfuscated beta.**

### Before you submit — store metadata you still need

These aren't code; you fill them in on the **Chrome Web Store Developer
Dashboard** when creating the listing. Reviewers reject submissions missing any.

| Requirement | Notes |
|---|---|
| Developer account | One-time US$ 5 fee at <https://chrome.google.com/webstore/devconsole>. |
| **Privacy policy URL** | Required (the manifest uses `unlimitedStorage` and `host_permissions`). A ready draft lives in `POLITICA_DE_PRIVACIDADE.md` — host it publicly and link it. |
| **Single-purpose description** | *"Baixar XML e PDF das NFS-e do usuário pela API oficial ADN usando o certificado digital."* |
| **Permission justifications** | One sentence per permission — see the table above. |
| Icons | `icons/icon16/48/128.png` — already bundled. 128×128 doubles as the listing image. |
| Screenshots | 1280×800 or 640×400 (PNG/JPEG), 1–5. Capture them from the running dev build. |
| Small promo tile | 440×280 — required, shown in search results. |
| Marquee promo tile | 1400×560 — optional. |
| Listing description | ≤ 132 chars short + a longer detailed description. |
| Category | **Productivity** or **Workflow & Planning**. |
| Languages | `pt_BR` (primary), optionally `en`. |
| Data usage disclosures | Declare you do NOT sell user data, do NOT use it for ads, and that it stays on the device. |
| `homepage_url` / `author.email` | Set in `manifest.config.ts`. |

### Bump the version before each upload

The store requires every upload to have a higher version than the last
published one.

1. Edit `"version"` in `package.json` (1–4 dot-separated integers up to 65535,
   no suffixes — `0.1.1`, `1.0.0`, `1.0.0.42`).
2. `npm run pack`.
3. Upload `dist-zip/baixar-nfse-v<new>.zip` in the dashboard.

The manifest reads `version` from `package.json`, so editing `package.json`
propagates automatically.

### Optional: signed `.crx` for private/self-hosted distribution

Only needed to distribute **outside** the Web Store (internal rollout,
side-loading). The store does not accept `.crx` uploads.

```bash
# one-time: generate a key (keep it secret, back it up)
openssl genrsa -out baixar-nfse.pem 2048
# package dist/ into a .crx (or use the npm package `crx3`)
npx crx3 -p baixar-nfse.pem -o baixar-nfse-v<version>.crx dist
```

A `.crx` signed with the same `.pem` keeps a stable extension ID across
versions.

## Privacy

Local-first by design. Certificates, notas and settings never leave the
browser — the only network traffic is **directly between you and the official
government servers** (`nfse.gov.br` / `adn.nfse.gov.br`). No analytics, no third
parties, no data sold. The full policy is in `POLITICA_DE_PRIVACIDADE.md`.

## License & contributing

Open source — study it, use it and contribute freely. It may **not** be sold or
commercialized as a product. Personal and professional use is, and will remain,
free. Issues and PRs: <https://github.com/e-mend/nfse-chrome-extension>.
