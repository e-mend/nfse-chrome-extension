import { useState } from 'react';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import type { RelTipo } from '../../lib/types';

/**
 * Card "depois de baixar" — DANFSe + Relatório + Lacunas.
 *
 * Mirrors the second card of certificado.html. The empresa selector at the top
 * scopes everything below (DANFSe / Relatório / ZIP / Excel / Lacunas) to one
 * empresa folder on disk; the rewrite of logic will populate the dropdown by
 * reading immediate subdirectories of the chosen root via the File System
 * Access API.
 */
export function PostDownloadCard() {
  const [empresa, setEmpresa] = useState<string | null>(null);
  const [tipo, setTipo] = useState<RelTipo>('Emitidas');
  const [ano, setAno] = useState<string | null>(null);
  const [mes, setMes] = useState<string | null>(null);

  const tipoOptions: Array<{ label: RelTipo; value: RelTipo }> = [
    { label: 'Emitidas', value: 'Emitidas' },
    { label: 'Recebidas', value: 'Recebidas' },
  ];

  return (
    <section className="bnf-card">
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 6,
          padding: '12px 0',
          borderBottom: '1px solid var(--bnf-line)',
          marginBottom: 6,
        }}
      >
        <Dropdown
          value={empresa}
          options={empresa ? [{ label: empresa, value: empresa }] : []}
          onChange={(e) => setEmpresa(e.value)}
          placeholder="Selecione a empresa"
          style={{ maxWidth: 280 }}
          showClear
        />
        <Button
          size="small"
          outlined
          icon="pi pi-refresh"
          aria-label="Recarregar empresas"
          title="Carregar/atualizar a lista de empresas da pasta."
          // TODO(logic): re-scan the chosen folder
          onClick={() => console.log('[stub] Recarregar empresas')}
        />
      </div>

      {/* DANFSe */}
      <div className="bnf-step" id="step4">
        <div className="bnf-step-num bnf-step-num--ghost" />
        <div className="bnf-step-body">
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <div className="bnf-step-title" style={{ margin: 0, minWidth: 128 }}>
              DANFSe (PDF)
            </div>
            <Button
              size="small"
              outlined
              icon="pi pi-file-pdf"
              label="Gerar DANFSe (PDF)"
              title="Gera o DANFSe (PDF) das notas da empresa selecionada que ainda NÃO têm PDF"
              disabled={!empresa}
              onClick={() => console.log('[stub] Gerar DANFSe')}
            />
            <Button
              size="small"
              outlined
              icon="pi pi-refresh"
              label="Refazer todos"
              title="Regera o PDF de TODAS as notas (use ao mudar o layout)"
              disabled={!empresa}
              onClick={() => console.log('[stub] Refazer DANFSe')}
            />
          </div>
        </div>
      </div>

      {/* Relatório */}
      <div className="bnf-step" id="stepRelatorio">
        <div className="bnf-step-num bnf-step-num--ghost" />
        <div className="bnf-step-body">
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
            <div className="bnf-step-title" style={{ margin: '0 0 6px', minWidth: 128 }}>
              Relatório
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <label htmlFor="relTipo" className="bnf-lbl">Tipo</label>
              <Dropdown
                inputId="relTipo"
                value={tipo}
                options={tipoOptions}
                onChange={(e) => setTipo(e.value as RelTipo)}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <label htmlFor="relAno" className="bnf-lbl">Ano</label>
              <Dropdown
                inputId="relAno"
                value={ano}
                options={[]}
                placeholder="—"
                onChange={(e) => setAno(e.value)}
                disabled
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <label htmlFor="relMes" className="bnf-lbl">Mês</label>
              <Dropdown
                inputId="relMes"
                value={mes}
                options={[]}
                placeholder="—"
                onChange={(e) => setMes(e.value)}
                disabled
              />
            </div>
            <Button
              size="small"
              outlined
              icon="pi pi-chart-bar"
              label="Visualizar Relatório"
              disabled={!empresa}
              onClick={() => console.log('[stub] Visualizar Relatório')}
            />
            <Button
              size="small"
              outlined
              icon="pi pi-box"
              label="Gerar ZIP"
              disabled={!empresa}
              onClick={() => console.log('[stub] Gerar ZIP')}
            />
            <Button
              size="small"
              outlined
              icon="pi pi-file-excel"
              label="Gerar Excel"
              disabled={!empresa}
              onClick={() => console.log('[stub] Gerar Excel')}
            />
          </div>
        </div>
      </div>

      {/* Lacunas */}
      <div className="bnf-step" id="stepAnalisar">
        <div className="bnf-step-num bnf-step-num--ghost" />
        <div className="bnf-step-body">
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <div className="bnf-step-title" style={{ margin: 0, minWidth: 128 }}>
              Lacunas de NSU
            </div>
            <Button
              size="small"
              outlined
              icon="pi pi-search"
              label="Analisar lacunas"
              disabled={!empresa}
              onClick={() => console.log('[stub] Analisar lacunas')}
              title="Lê os NSU dos nomes dos arquivos já baixados e aponta se algum NSU ficou sem arquivo"
            />
            <span className="bnf-hint" style={{ margin: 0 }}>
              Mostra se faltou algum NSU na pasta.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
