import { Step1Conectar } from './Step1Conectar';
import { Step2Empresa } from './Step2Empresa';
import { Step3Pasta } from './Step3Pasta';
import { Step4Baixar } from './Step4Baixar';
import type { DetectedEmpresa } from '../../lib/types';

interface StepsCardProps {
  detected: DetectedEmpresa | null;
  folderName: string | null;
  onConnect: () => void;
  onPickFolder: () => void;
  onSyncNovos: () => void;
}

/** First card: the 4-step workflow (Conectar → Empresa → Pasta → Baixar). */
export function StepsCard(props: StepsCardProps) {
  const { detected, folderName, onConnect, onPickFolder, onSyncNovos } = props;
  const connected = detected !== null;

  return (
    <section className="bnf-card">
      <Step1Conectar onConnect={onConnect} />
      <Step2Empresa detected={detected} />
      <Step3Pasta folderName={folderName} onPickFolder={onPickFolder} />
      <Step4Baixar connected={connected} onSyncNovos={onSyncNovos} />
    </section>
  );
}
