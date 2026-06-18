import { useMemo, useRef } from 'react';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { Toast } from 'primereact/toast';
import { useRxCollection } from 'rxdb/plugins/react';
import { SETTING_KEYS, useSetting } from '../../lib/useSettings';
import {
  buildFileName,
  DEFAULT_NAMING_PATTERN,
  NAMING_PRESETS,
  NAMING_TOKENS,
  SAMPLE_META,
} from '../../lib/fileNaming';
import {
  CONTAINER_WIDTH_PRESETS,
  CUSTOM_CONTAINER_WIDTH,
  DEFAULT_CONTAINER_WIDTH,
} from '../../lib/layout';
import { useToast } from '../../lib/useToast';
import { clearDirHandle } from '../../lib/folderAccess';
import type { EmpresaCollection, NotaCollection, SettingCollection } from '../../db';

const PRESET_PATTERNS = NAMING_PRESETS.map((p) => p.pattern);

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="bnf-card"
      style={{ padding: '14px 16px 16px', marginBottom: 16 }}
    >
      <h2 style={{ margin: '4px 0 4px' }}>{title}</h2>
      {description && (
        <p style={{ margin: '0 0 12px', color: 'var(--bnf-muted)', fontSize: 12, lineHeight: 1.5 }}>
          {description}
        </p>
      )}
      {children}
    </section>
  );
}

export function SettingsTab() {
  const { toastRef, showToast } = useToast();

  const notasCollection = useRxCollection('notas') as NotaCollection | null;
  const empresasCollection = useRxCollection('empresas') as EmpresaCollection | null;
  const settingsCollection = useRxCollection('settings') as SettingCollection | null;

  const { value: storedPattern, setValue: setPattern } = useSetting(SETTING_KEYS.pdfNamePattern);
  const pattern = storedPattern || DEFAULT_NAMING_PATTERN;

  const { value: storedWidth, setValue: setWidth } = useSetting(SETTING_KEYS.containerWidth);
  const width = storedWidth || DEFAULT_CONTAINER_WIDTH;
  const isCustomWidth = !CONTAINER_WIDTH_PRESETS.some((p) => p.value === width);

  // Live preview of the chosen PDF naming pattern.
  const preview = useMemo(
    () => buildFileName(pattern, SAMPLE_META, 1024, 'pdf', 'nota'),
    [pattern],
  );

  const presetSelectValue = PRESET_PATTERNS.includes(pattern) ? pattern : '__custom__';

  // ── PDF naming handlers ──────────────────────────────────────────────────
  const onPresetChange = (value: string) => {
    if (value === '__custom__') return; // keep current custom text
    void setPattern(value);
  };

  const insertToken = (key: string) => {
    void setPattern(`${pattern}{${key}}`);
  };

  // ── Container width handlers ─────────────────────────────────────────────
  const onWidthPresetChange = (value: string) => {
    if (value === CUSTOM_CONTAINER_WIDTH) {
      // Seed the custom field with the current numeric width so the InputNumber
      // shows something sensible.
      void setWidth(width.endsWith('px') ? width : '1400px');
      return;
    }
    void setWidth(value);
  };

  const widthSelectValue = isCustomWidth ? CUSTOM_CONTAINER_WIDTH : width;
  const customWidthPx = isCustomWidth ? parseInt(width, 10) || 1400 : 1400;

  // ── Wipe handlers ────────────────────────────────────────────────────────
  const wipeBusy = useRef(false);

  const wipeNotas = async () => {
    if (!notasCollection || wipeBusy.current) return;
    wipeBusy.current = true;
    try {
      const removed = await notasCollection.find().remove();
      showToast('success', 'Notas apagadas', `${removed.length} nota(s) removida(s) do banco local.`);
    } catch (err) {
      console.error('[Settings] wipe notas failed', err);
      showToast('error', 'Erro ao apagar notas', err instanceof Error ? err.message : String(err));
    } finally {
      wipeBusy.current = false;
    }
  };

  const wipeAll = async () => {
    if (wipeBusy.current) return;
    wipeBusy.current = true;
    try {
      let notas = 0;
      let empresas = 0;
      if (notasCollection) notas = (await notasCollection.find().remove()).length;
      if (empresasCollection) empresas = (await empresasCollection.find().remove()).length;
      if (settingsCollection) await settingsCollection.find().remove();
      await clearDirHandle().catch((e) => console.warn('[Settings] clearDirHandle failed', e));
      showToast(
        'success',
        'Todos os dados apagados',
        `${notas} nota(s) e ${empresas} empresa(s) removidas. As preferências foram redefinidas.`,
      );
    } catch (err) {
      console.error('[Settings] wipe all failed', err);
      showToast('error', 'Erro ao apagar dados', err instanceof Error ? err.message : String(err));
    } finally {
      wipeBusy.current = false;
    }
  };

  const confirmWipeNotas = () => {
    confirmDialog({
      header: 'Apagar todas as notas?',
      message:
        'Isso remove permanentemente todas as notas salvas no banco local deste navegador. ' +
        'As empresas e suas configurações de NSU serão mantidas. Esta ação não pode ser desfeita.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Apagar notas',
      rejectLabel: 'Cancelar',
      acceptClassName: 'p-button-danger',
      accept: () => void wipeNotas(),
    });
  };

  const confirmWipeAll = () => {
    confirmDialog({
      header: 'Apagar TODOS os dados?',
      message:
        'Isso remove permanentemente todas as notas, empresas, preferências e a pasta lembrada. ' +
        'A extensão voltará ao estado inicial. Esta ação não pode ser desfeita.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Apagar tudo',
      rejectLabel: 'Cancelar',
      acceptClassName: 'p-button-danger',
      accept: () => void wipeAll(),
    });
  };

  return (
    <div className="bnf-tab-content">
      <Toast ref={toastRef} />
      <ConfirmDialog />

      {/* PDF naming ---------------------------------------------------- */}
      <SettingsSection
        title="Nome do arquivo PDF (DANFSe)"
        description="Defina como os PDFs baixados serão nomeados. Escolha um modelo pronto ou monte o seu usando os campos disponíveis abaixo."
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label htmlFor="pdfPreset" className="bnf-lbl">Modelo</label>
            <Dropdown
              inputId="pdfPreset"
              value={presetSelectValue}
              options={[
                ...NAMING_PRESETS.map((p) => ({ label: p.label, value: p.pattern })),
                { label: 'Personalizado…', value: '__custom__' },
              ]}
              onChange={(e) => onPresetChange(e.value as string)}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label htmlFor="pdfPattern" className="bnf-lbl">Padrão (editável)</label>
            <InputText
              id="pdfPattern"
              value={pattern}
              onChange={(e) => void setPattern(e.target.value)}
              placeholder={DEFAULT_NAMING_PATTERN}
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
            />
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <span className="bnf-lbl" style={{ display: 'block', marginBottom: 4 }}>
            Campos disponíveis (clique para inserir)
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {NAMING_TOKENS.map((t) => (
              <Button
                key={t.key}
                size="small"
                text
                outlined
                label={`{${t.key}}`}
                tooltip={t.label}
                tooltipOptions={{ position: 'top' }}
                onClick={() => insertToken(t.key)}
                style={{ padding: '2px 8px', fontSize: 11, fontFamily: 'ui-monospace, monospace' }}
              />
            ))}
          </div>
        </div>

        <div
          style={{
            marginTop: 12,
            padding: '8px 10px',
            border: '1px solid var(--bnf-line)',
            borderRadius: 6,
            fontSize: 12.5,
          }}
        >
          <span style={{ color: 'var(--bnf-muted)' }}>Prévia: </span>
          <strong style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{preview}</strong>
        </div>
      </SettingsSection>

      {/* Container width ----------------------------------------------- */}
      <SettingsSection
        title="Tamanho do container"
        description="Aumente a largura da área de conteúdo para ganhar espaço na tabela de notas. Use 'Cheio' para ocupar toda a tela."
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 220 }}>
            <label htmlFor="containerWidth" className="bnf-lbl">Largura</label>
            <Dropdown
              inputId="containerWidth"
              value={widthSelectValue}
              options={[
                ...CONTAINER_WIDTH_PRESETS,
                { label: 'Personalizado…', value: CUSTOM_CONTAINER_WIDTH },
              ]}
              onChange={(e) => onWidthPresetChange(e.value as string)}
            />
          </div>

          {isCustomWidth && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 180 }}>
              <label htmlFor="containerWidthPx" className="bnf-lbl">Largura personalizada</label>
              <InputNumber
                inputId="containerWidthPx"
                value={customWidthPx}
                onValueChange={(e) =>
                  void setWidth(`${typeof e.value === 'number' ? e.value : 1400}px`)
                }
                min={600}
                max={4000}
                step={50}
                suffix=" px"
                showButtons
                buttonLayout="horizontal"
                decrementButtonIcon="pi pi-minus"
                incrementButtonIcon="pi pi-plus"
                inputStyle={{ width: 110 }}
              />
            </div>
          )}
        </div>
      </SettingsSection>

      {/* Danger zone --------------------------------------------------- */}
      <section
        className="bnf-card"
        style={{
          padding: '14px 16px 16px',
          marginBottom: 16,
          borderLeft: '3px solid var(--bnf-error-fg, #dc2626)',
        }}
      >
        <h2 style={{ margin: '4px 0 4px' }}>Zona de perigo</h2>
        <p style={{ margin: '0 0 14px', color: 'var(--bnf-muted)', fontSize: 12, lineHeight: 1.5 }}>
          Estas ações apagam dados do banco local deste navegador e não podem ser desfeitas.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <Button
            severity="warning"
            outlined
            icon="pi pi-trash"
            label="Apagar somente as notas"
            onClick={confirmWipeNotas}
          />
          <Button
            severity="danger"
            icon="pi pi-exclamation-triangle"
            label="Apagar todos os dados"
            onClick={confirmWipeAll}
          />
        </div>
      </section>
    </div>
  );
}
