import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PrimeReactProvider } from 'primereact/api';

import 'primereact/resources/themes/lara-dark-teal/theme.css';
import 'primeicons/primeicons.css';
import 'primeflex/primeflex.css';
import '../styles/global.css';

import { CertificadoApp } from './CertificadoApp';
import { DbProvider } from '../db';
import { SyncProvider } from '../lib/syncContext';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root container not found in index.html');

createRoot(rootEl).render(
  <StrictMode>
    <PrimeReactProvider value={{ ripple: true }}>
      <DbProvider>
        <SyncProvider>
          <CertificadoApp />
        </SyncProvider>
      </DbProvider>
    </PrimeReactProvider>
  </StrictMode>,
);
