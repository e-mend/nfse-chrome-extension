import { StepsCard } from './StepsCard';
import { SyncProgress } from './SyncProgress';
import { PortalHint } from './PortalHint';
import type { DetectedEmpresa } from '../../lib/types';

interface ConnectionTabProps {
  detected: DetectedEmpresa | null;
  folderName: string | null;
  onConnect: () => void;
  onPickFolder: () => void;
  onSyncNovos: () => void;
  onStop: () => void;
  progress: any;
  showProgress: (visible: boolean) => void;
  setProgressBusy: (busy: boolean) => void;
  setProgress: (label: string, count: string, percent: number) => void;
  resetProgress: () => void;
  portalHintVisible: boolean;
  setPortalHintVisible: (visible: boolean) => void;
}

export function ConnectionTab({
  detected,
  folderName,
  onConnect,
  onPickFolder,
  onSyncNovos,
  onStop,
  progress,
  portalHintVisible,
  setPortalHintVisible
}: ConnectionTabProps) {
  return (
    <div className="bnf-tab-content">
      <StepsCard
        detected={detected}
        folderName={folderName}
        onConnect={onConnect}
        onPickFolder={onPickFolder}
        onSyncNovos={onSyncNovos}
      />

      {progress.visible && (
        <SyncProgress
          label={progress.label}
          count={progress.count}
          percent={progress.percent}
          busy={progress.busy}
          onStop={onStop}
        />
      )}

      {portalHintVisible && <PortalHint onDismiss={() => setPortalHintVisible(false)} />}
    </div>
  );
}