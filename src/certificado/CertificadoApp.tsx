import { useState, useCallback, useEffect, useRef } from 'react';
import { useRxCollection } from 'rxdb/plugins/react';
import { Header } from './components/Header';
import { TabNavigation } from './components/TabNavigation';
import { AboutTab } from './components/AboutTab';
import { ConnectionTab } from './components/ConnectionTab';
import { CompaniesTab } from './components/CompaniesTab';
import { BackupTab } from './components/BackupTab';
import { DownloadTab } from './components/DownloadTab';
import { NotasTab } from './components/NotasTab';
import { SettingsTab } from './components/SettingsTab';
import { useProgress } from '../lib/progress';
import type { DetectedEmpresa, PingAdnRetryInfo } from '../lib/types';
import { useToast } from '../lib/useToast';
import { Toast } from 'primereact/toast';
import { useApi, ADN_STATUS_PROCESSAMENTO_ENUM } from '../lib/useApi';
import { useXml, buildNotaFileName } from '../lib/useXml';
import { detectOwner } from '../lib/detectOwner';
import type { EmpresaCollection, NotaCollection } from '../db';
import type { EmpresaDoc } from '../db/schemas/empresa';
import { insertNotaIfNew } from '../db/schemas/nota';
import { SETTING_KEYS, useSetting } from '../lib/useSettings';
import { DEFAULT_CONTAINER_WIDTH } from '../lib/layout';
import { loadDirHandle, pickFolder } from '../lib/folderAccess';
import { useSync } from '../lib/syncContext';
import { SyncFloatingProgress } from './components/SyncFloatingProgress';

/**
 * Insert a new empresa on the very first connection, or refresh the cosmetic
 * fields (razão social, cnpjConsulta, updatedAt) on subsequent connections.
 *
 * We deliberately don't touch `ultimoNSU` / `ultimaSync` here: those are
 * owned by the sync flow and the manual NSU editor in EmpresasCard. Patching
 * them on every connect would silently rewind the cursor.
 */
async function upsertEmpresa(
  collection: EmpresaCollection,
  cnpj: string,
  razaoSocial: string,
  cnpjConsulta: string,
): Promise<EmpresaDoc> {
  const now = Date.now();
  const existing = await collection.findOne(cnpj).exec();
  if (existing) {
    await existing.patch({
      razaoSocial: razaoSocial || existing.razaoSocial,
      cnpjConsulta: cnpjConsulta || existing.cnpjConsulta,
      updatedAt: now,
    });
    return existing.toJSON() as EmpresaDoc;
  }
  const doc = await collection.insert({
    cnpj,
    razaoSocial: razaoSocial || '',
    ultimoNSU: 0,
    ultimaSync: null,
    cnpjConsulta: cnpjConsulta || '',
    syncInterrupted: false,
    createdAt: now,
    updatedAt: now,
  });
  return doc.toJSON() as EmpresaDoc;
}

export function CertificadoApp() {
  const { progress, showProgress, setProgressBusy, setProgress, resetProgress } = useProgress();
  const { toastRef, showToast } = useToast();
  const { pingADN, forceZero, forceZeroNow } = useApi();
  const { parseLote } = useXml();
  const { startSync } = useSync();

  const empresasCollection = useRxCollection<EmpresaDoc>('empresas') as EmpresaCollection | null;
  const notasCollection = useRxCollection('notas') as NotaCollection | null;

  const [detected, setDetected] = useState<DetectedEmpresa | null>(null);
  const [portalHintVisible, setPortalHintVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('connection');

  // The folder NAME persists in the settings collection (display + reload),
  // while the actual directory handle lives in IndexedDB and is kept in this
  // ref for the (upcoming) write/download flow.
  const { value: folderName, setValue: setFolderName } = useSetting(SETTING_KEYS.pastaNome);
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  // User-configurable layout width (Configurações tab). Applied as the
  // max-width of the top-level wrapper so the notas table can get more room.
  const { value: containerWidth } = useSetting(SETTING_KEYS.containerWidth);

  // Re-hydrate the saved directory handle on mount so a previously chosen
  // folder is available again without re-picking (permission is re-requested
  // lazily on first write).
  useEffect(() => {
    let cancelled = false;
    loadDirHandle()
      .then((handle) => { if (!cancelled && handle) dirHandleRef.current = handle; })
      .catch((err) => console.warn('[Cert] não foi possível recuperar a pasta salva', err));
    return () => { cancelled = true; };
  }, []);

  const handleRetry = useCallback(
    ({ tentativa, total, status, aguardarSeg }: PingAdnRetryInfo) => {
      showToast('warn', `Tentando de novo (${tentativa}/${total}) — aguardando ${aguardarSeg}s (HTTP ${status})…`, 'Aguarde um momento para que o certificado seja escolhido.');
    },
    [showToast]);

  const handleConnect = useCallback(async () => {
    showToast('info', 'Escolha o seu certificado no popup do Chrome para conectar.', 'Aguarde um momento para que o certificado seja escolhido.');
    showToast('info', 'Conectando…', 'Aguarde um momento para que o certificado seja escolhido.');

    let result = await pingADN(0, { onRetry: handleRetry });

    if (!result.ok && result.networkError && forceZeroNow === false) {
      await forceZero();
      result = await pingADN(0, { onRetry: handleRetry });
    }

    if (!result.ok) {
      showToast('error', 'Erro ao conectar', result.error || 'Ocorreu um erro ao conectar.');
      return;
    }

    const lotes = result.data?.LoteDFe ?? [];
    const statusProcessamento = result.data?.StatusProcessamento;
    if (
      statusProcessamento === ADN_STATUS_PROCESSAMENTO_ENUM.NENHUM_DOCUMENTO_LOCALIZADO ||
      statusProcessamento === ADN_STATUS_PROCESSAMENTO_ENUM.REJEICAO ||
      lotes.length === 0
    ) {
      setDetected(null);
      showToast('error', 'Erro ao conectar', 'Nenhum documento localizado.');
      return;
    }

    showToast('info', 'Carregando dados...', 'Aguarde um momento para que os dados sejam sincronizados.');

    const items = await parseLote(lotes);
    const metas = items.map((it) => it.meta);
    // Owner of the mailbox = the CNPJ/CPF that appears in every document.
    // Ranking + tiebreaker logic lives in detectOwner.ts — see the comments
    // there for the why.
    const detection = detectOwner(metas);
    if (!detection) {
      setDetected(null);
      showToast(
        'warn',
        'Empresa não detectada',
        'Conectado, mas não consegui extrair o CNPJ dos XMLs (layout diferente). Veja o console.',
      );
      return;
    }

    if (detection.ambiguous && detection.runnerUp) {
      console.info(
        '[Cert] detecção ambígua na amostra: escolhido %s · outro candidato %s',
        detection.owner.nome || detection.owner.doc,
        detection.runnerUp.nome || detection.runnerUp.doc,
      );
    }

    // Persist the detected empresa right after a successful connect so it
    // shows up in the "Empresas" tab — even before the user has synced any
    // XML. Uses a non-destructive patch on subsequent connects (NSU/ultimaSync
    // stay untouched).
    let empresa: EmpresaDoc | null = null;
    if (empresasCollection) {
      try {
        empresa = await upsertEmpresa(
          empresasCollection,
          detection.owner.doc,
          detection.owner.nome || '',
          '',
        );
      } catch (err) {
        console.error('[Cert] falha ao salvar empresa', err);
        showToast(
          'warn',
          'Empresa detectada, mas não consegui salvar',
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    setDetected({
      cnpj: detection.owner.doc,
      nome: detection.owner.nome,
      prevNSU: empresa?.ultimoNSU ?? null,
      cnpjConsulta: empresa?.cnpjConsulta ?? '',
    });

    // Persist the parsed batch into the local `notas` collection. Each row
    // is keyed by `chave` (with deterministic fallbacks for DPS/eventos), so
    // calling Conectar a second time on the same mailbox is a no-op for any
    // doc we've already stored — duplicates are dropped at the DB layer via
    // `insertNotaIfNew` (see db/schemas/nota.ts:124).
    let inserted = 0;
    let duplicates = 0;
    let failed = 0;
    if (notasCollection) {
      for (const item of items) {
        try {
          const result = await insertNotaIfNew(notasCollection, {
            meta: item.meta,
            nsu: item.nsu,
            xml: item.xml,
            name: buildNotaFileName(item.meta, item.nsu),
            ownerDoc: detection.owner.doc,
          });
          if (result.inserted) inserted += 1;
          else duplicates += 1;
        } catch (err) {
          failed += 1;
          console.warn('[Cert] falha ao salvar nota', err);
        }
      }
    } else {
      console.warn('[Cert] coleção `notas` indisponível — notas não foram salvas');
    }

    const detalhe =
      `${inserted} nova(s) salva(s) · ${duplicates} já existiam` +
      (failed ? ` · ${failed} com erro` : '');
    showToast(
      'success',
      'Conectado com sucesso',
      `Certificado aceito pelo ADN. ${detalhe}.`,
    );
  }, [
    pingADN,
    forceZero,
    forceZeroNow,
    handleRetry,
    showToast,
    parseLote,
    empresasCollection,
    notasCollection,
  ]);

  const handlePickFolder = useCallback(async () => {
    const result = await pickFolder();
    if (!result.ok) {
      if (result.cancelled) return; // user dismissed the native picker — stay quiet
      showToast('error', 'Não foi possível escolher a pasta', result.error || 'Erro desconhecido.');
      return;
    }
    dirHandleRef.current = result.handle;
    await setFolderName(result.name);
    showToast('success', 'Pasta escolhida', `Os arquivos serão salvos em "${result.name}".`);
  }, [setFolderName, showToast]);

  const handleSyncNovos = useCallback(() => {
    if (!detected) {
      showToast('warn', 'Conecte um certificado primeiro.', 'O ADN precisa do certificado conectado para sincronizar.');
      return;
    }
    startSync({
      cnpj: detected.cnpj,
      razaoSocial: detected.nome,
      cnpjConsulta: detected.cnpjConsulta,
    });
    showToast('info', 'Sincronização iniciada', 'Acompanhe o progresso no canto inferior direito.');
  }, [detected, startSync, showToast]);

  const handleStop = useCallback(() => {
    resetProgress();
  }, [resetProgress]);

  return (
    <div className="bnf-wrap" style={{ maxWidth: containerWidth || DEFAULT_CONTAINER_WIDTH }}>
      <Header />
      
      <div className="bnf-main-content">
        <div className="bnf-left-menu">
          <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
        </div>
        
        <div className="bnf-tab-container">
          {activeTab === 'connection' && (
            <ConnectionTab
              detected={detected}
              folderName={folderName}
              onConnect={handleConnect}
              onPickFolder={handlePickFolder}
              onSyncNovos={handleSyncNovos}
              onStop={handleStop}
              progress={progress}
              showProgress={showProgress}
              setProgressBusy={setProgressBusy}
              setProgress={setProgress}
              resetProgress={resetProgress}
              portalHintVisible={portalHintVisible}
              setPortalHintVisible={setPortalHintVisible}
            />
          )}
          
          {activeTab === 'companies' && (
            <CompaniesTab />
          )}
          
          {activeTab === 'notas' && (
            <NotasTab />
          )}
          
          {activeTab === 'backup' && (
            <BackupTab />
          )}
          
          {activeTab === 'download' && (
            <DownloadTab />
          )}

          {activeTab === 'settings' && (
            <SettingsTab />
          )}

          {activeTab === 'about' && (
            <AboutTab />
          )}
        </div>
      </div>

      <p className="bnf-footer-note">
        Baixar NFSe · React/PrimeReact/RxDB skeleton — sessão única de certificado.
      </p>

      <Toast ref={toastRef} />
      <SyncFloatingProgress />
    </div>
  );
}
