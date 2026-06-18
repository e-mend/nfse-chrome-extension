import { useRef } from 'react';
import { Button } from 'primereact/button';

/**
 * Card 4 — Backup. Export/import the NSU control + preferences as a single
 * .json file (used to migrate to another PC). Logic stubbed; the rewrite will
 * dump RxDB documents (or chrome.storage), and the import will validate +
 * upsert in a single transaction.
 */
export function BackupCard() {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    // TODO(logic): implement the JSON-dump export
    console.log('[stub] Exportar backup');
  };

  const handleImportClick = () => fileRef.current?.click();

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // TODO(logic): parse + upsert into RxDB empresas + settings
    console.log('[stub] Importar backup', file.name);
  };

  return (
    <section className="bnf-card">
      <h2 style={{ margin: '12px 0 4px' }}>Backup</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Button
          size="small"
          outlined
          icon="pi pi-download"
          label="Exportar"
          title="Salvar o controle de NSU (e preferências) num arquivo — backup ou troca de PC"
          onClick={handleExport}
        />
        <Button
          size="small"
          outlined
          icon="pi pi-upload"
          label="Importar"
          title="Restaurar o controle de NSU de um arquivo de backup"
          onClick={handleImportClick}
        />
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={handleImportFile}
        />
        <span className="bnf-hint" style={{ margin: 0 }}>
          Salva/restaura o controle de NSU (.json) — pra outro PC.
        </span>
      </div>
    </section>
  );
}
