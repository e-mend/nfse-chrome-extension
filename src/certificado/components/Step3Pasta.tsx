import { useState } from 'react';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import type { OrgNome } from '../../lib/types';
import { SETTING_KEYS, useSetting } from '../../lib/useSettings';

interface Step3PastaProps {
  folderName: string | null;
  onPickFolder: () => void;
}

/**
 * Step 3 — destination folder + organization options.
 *
 * Always unlocked (does NOT require an active certificate, mirroring the
 * original `stepPasta` which is the only step that stays interactive even
 * before connecting).
 */
export function Step3Pasta({ folderName, onPickFolder }: Step3PastaProps) {
  const { value: orgNome, setValue: setOrgNome } = useSetting<OrgNome>(SETTING_KEYS.orgNome, 'num');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const orgNomeOptions: Array<{ label: string; value: OrgNome }> = [
    { label: 'Número + Nome + NSU', value: 'num' },
    { label: 'Data Emissão + Número + Nome + NSU', value: 'datanum' },
  ];

  return (
    <div className="bnf-step" id="stepPasta">
      <div className="bnf-step-num">3</div>
      <div className="bnf-step-body">
        <div className="bnf-step-title">Pasta e organização</div>

        <div className="bnf-pasta-grid">
          <span className="bnf-lbl">Pasta de destino</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <Button
              size="small"
              outlined
              icon="pi pi-folder-open"
              label="Escolher pasta"
              onClick={onPickFolder}
              title="Escolhe a pasta no seu computador onde os XML (e PDFs) serão salvos"
            />
            {folderName && (
              <span className="bnf-hint" style={{ margin: 0 }}>
                Salvando em: <strong>{folderName}</strong>
              </span>
            )}
            <button
              type="button"
              className="bnf-link-mais"
              aria-expanded={advancedOpen}
              style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}
              onClick={() => setAdvancedOpen((v) => !v)}
            >
              ⚙ Mais opções {advancedOpen ? '▾' : '▸'}
            </button>
          </div>
        </div>

        {advancedOpen && (
          <div
            className="bnf-pasta-grid"
            style={{ marginTop: 6, maxWidth: 500 }}
          >
            <span className="bnf-lbl">Subpastas</span>
            <strong
              style={{ fontWeight: 600, alignSelf: 'center', fontSize: 12 }}
              title="Estrutura fixa, pensada pro fechamento contábil: cada mês de competência reúne Emitidas + Recebidas + Eventos num lugar só."
            >
              Empresa / Ano / Mês / Tipo (Emitidas/Recebidas/Eventos)
            </strong>

            <span className="bnf-lbl">Organizar o XML/mês por</span>
            <strong
              style={{ fontWeight: 600, alignSelf: 'center', fontSize: 12 }}
              title="Os meses são separados pela data de COMPETÊNCIA (padrão contábil)."
            >
              Data de Competência
            </strong>

            <span className="bnf-lbl">Nome do arquivo (Eventos)</span>
            <strong
              style={{ fontWeight: 600, alignSelf: 'center', fontSize: 12 }}
              title="Eventos sempre nomeados por Data do Evento + Descrição + Número da nota + NSU."
            >
              Data do Evento + Descrição + Número da nota + NSU
            </strong>

            <label htmlFor="selOrgNome" className="bnf-lbl">
              Nome do arquivo (NFS-e)
            </label>
            <Dropdown
              inputId="selOrgNome"
              value={orgNome ?? 'num'}
              options={orgNomeOptions}
              onChange={(e) => { void setOrgNome(e.value as OrgNome); }}
              style={{ fontSize: 11.5 }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
