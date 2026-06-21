import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'Baixar NFSe — Certificado Digital',
  description:
    'Baixa XML e PDF das Notas Fiscais de Serviço Eletrônica (NFS-e) pela API oficial ADN, autenticando com seu certificado digital.',
  version: pkg.version,
  author: { email: 'vhyper616@gmail.com' },
  homepage_url: 'https://github.com/e-mend/nfse-chrome-extension',
  icons: {
    16: 'icons/icon16.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
  action: {
    default_icon: {
      16: 'icons/icon16.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
    default_title: 'Baixar NFSe',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  permissions: [
    'downloads',
    'unlimitedStorage',
  ],
  host_permissions: [
    'https://www.nfse.gov.br/*',
    'https://adn.nfse.gov.br/*',
  ],
  web_accessible_resources: [
    {
      resources: ['src/certificado/index.html'],
      matches: ['<all_urls>'],
    },
  ],
});
