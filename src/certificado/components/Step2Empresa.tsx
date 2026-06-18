import { formatCnpjCpf } from '../../lib/format';
import type { DetectedEmpresa } from '../../lib/types';

interface Step2EmpresaProps {
  detected: DetectedEmpresa | null;
}

/**
 * Step 2 — read-only summary of the empresa derived from the first ADN batch,
 * plus two optional toggles inherited from the original:
 *
 *   - "Consultar uma filial": switch the box being read while keeping the
 *     matriz certificate. Reveals a CNPJ input + "Trocar para a filial".
 *   - "Recuperar uma faixa de NSU": reveals "De ... até" inputs and flips the
 *     Step 4 button into "Baixar faixa (XML)".
 *
 * State is local for now; CertificadoApp will lift it once the logic layer
 * needs to feed the values into the ADN call.
 */
export function Step2Empresa({ detected }: Step2EmpresaProps) {
  const locked = detected === null;

  return (
    <div className={`bnf-step ${locked ? 'locked' : ''}`} id="step2">
      <div className="bnf-step-num">2</div>
      <div className="bnf-step-body">
        <div className="bnf-step-title">Confira a empresa</div>
        <div className="bnf-emp-info">
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 7 }}>
            <span className="bnf-emp-nome">{detected?.nome ?? '—'}</span>
            <span className="bnf-emp-meta" style={{ marginTop: 0, whiteSpace: 'nowrap' }}>
              <span style={{ opacity: 0.4 }}>·</span>{' '}
              {detected ? formatCnpjCpf(detected.cnpj) : '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
