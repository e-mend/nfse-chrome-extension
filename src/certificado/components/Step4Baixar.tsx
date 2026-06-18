import { Button } from 'primereact/button';

interface Step4BaixarProps {
  connected: boolean;
  onSyncNovos: () => void;
}

export function Step4Baixar({ connected, onSyncNovos }: Step4BaixarProps) {
  const label = connected ? 'Sincronizar' : 'Conecte o certificado';
  const title = connected
    ? 'Incremental — baixa e salva só o que é novo desde o último NSU.'
    : 'Conecte o certificado (passo 1) para liberar a sincronização';

  return (
    <div className="bnf-step" id="step3">
      <div className="bnf-step-num">4</div>
      <div className="bnf-step-body">
        <div className="bnf-step-title">Sincronize as notas</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <Button
            className="bnf-primary"
            size="small"
            icon="pi pi-sync"
            label={label}
            disabled={!connected}
            onClick={onSyncNovos}
            title={title}
          />
          <span className="bnf-hint" style={{ margin: 0 }}>
            Incremental — baixa e salva só o que é novo desde o último NSU.
          </span>
        </div>
        <div className="bnf-hint" style={{ margin: '6px 0 0' }}>
          📌 O progresso aparece no canto inferior direito. Você pode trocar de aba que a
          sincronização continua.
        </div>
      </div>
    </div>
  );
}
