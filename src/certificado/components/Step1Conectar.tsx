import { Button } from 'primereact/button';

interface Step1ConectarProps {
  onConnect: () => void;
}

export function Step1Conectar({ onConnect }: Step1ConectarProps) {
  return (
    <div className="bnf-step" id="step1">
      <div className="bnf-step-num">1</div>
      <div className="bnf-step-body">
        <div className="bnf-step-title">Conecte seu certificado digital</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <Button
            className="bnf-primary"
            size="small"
            icon="pi pi-lock"
            label="Conectar"
            onClick={onConnect}
          />
          <p className="bnf-hint" style={{ margin: 0 }}>
            Escolha o certificado digital do <strong>CNPJ/CPF</strong> que quer consultar.
          </p>
        </div>
      </div>
    </div>
  );
}
