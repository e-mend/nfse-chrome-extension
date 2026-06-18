import { useState } from 'react';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { Toast } from 'primereact/toast';
import { useRxCollection } from 'rxdb/plugins/react';
import { findNotas, type NotaCollection, type NotaDoc, type NotaQueryOptions } from '../../db/schemas/nota';
import type { EmpresaDoc } from '../../db/schemas/empresa';
import { useToast } from '../../lib/useToast';
import { buildRelatorioHtml, openRelatorioWindow, type RelatorioEmpresaInfo } from '../../lib/relatorio';

export type RelatorioTipo = 'emitidas' | 'recebidas' | 'eventos';

const TIPO_OPTIONS: Array<{ label: string; value: RelatorioTipo }> = [
  { label: 'Emitidas', value: 'emitidas' },
  { label: 'Recebidas', value: 'recebidas' },
  { label: 'Eventos', value: 'eventos' },
];

const MES_OPTIONS: Array<{ label: string; value: number }> = [
  { label: 'Janeiro', value: 1 },
  { label: 'Fevereiro', value: 2 },
  { label: 'Março', value: 3 },
  { label: 'Abril', value: 4 },
  { label: 'Maio', value: 5 },
  { label: 'Junho', value: 6 },
  { label: 'Julho', value: 7 },
  { label: 'Agosto', value: 8 },
  { label: 'Setembro', value: 9 },
  { label: 'Outubro', value: 10 },
  { label: 'Novembro', value: 11 },
  { label: 'Dezembro', value: 12 },
];

// Year picker: current year back through a sensible accounting window.
const CURRENT_YEAR = new Date().getFullYear();
const ANO_OPTIONS: Array<{ label: string; value: number }> = Array.from(
  { length: 6 },
  (_, i) => CURRENT_YEAR - i,
).map((y) => ({ label: String(y), value: y }));

/**
 * "Relatório" — inline controls to generate a PDF report of the stored notas,
 * filtered by tipo (Emitidas/Recebidas/Eventos), ano and mês.
 *
 * UI only for now: the actual report generation is wired up separately.
 */
export function RelatorioCard() {
  const collection = useRxCollection<NotaDoc>('notas') as NotaCollection | null;
  const empresasCollection = useRxCollection<EmpresaDoc>('empresas');
  const { toastRef, showToast } = useToast();

  const [tipo, setTipo] = useState<RelatorioTipo>('emitidas');
  const [ano, setAno] = useState<number | null>(null);
  const [mes, setMes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const onVisualizar = async () => {
    if (!collection) {
      showToast('error', 'Banco indisponível', 'A coleção de notas ainda não está pronta.');
      return;
    }
    setBusy(true);
    try {
      // Filter by tipoDocumento (NFS-e for emitidas/recebidas, evento for
      // eventos) plus the competência window; the empresa grouping happens in
      // the report builder.
      const opts: NotaQueryOptions = {
        tipoDocumento: tipo === 'eventos' ? 'EVENTO' : 'NFSE',
        sortField: 'dataEmissaoISO',
        sortOrder: 'asc',
      };
      if (ano && mes) opts.competenciaMes = `${ano}-${String(mes).padStart(2, '0')}`;
      else if (ano) opts.competenciaAno = String(ano);

      const notas = await findNotas(collection, opts);
      if (notas.length === 0) {
        showToast('warn', 'Nenhuma nota encontrada', 'Ajuste o tipo, ano ou mês e tente novamente.');
        return;
      }

      const empresaDocs = empresasCollection
        ? await empresasCollection.find({ selector: {} }).exec()
        : [];
      const empresas: RelatorioEmpresaInfo[] = empresaDocs.map((d) => ({
        cnpj: d.cnpj,
        razaoSocial: d.razaoSocial,
      }));

      const html = buildRelatorioHtml({ tipo, ano, mes, notas, empresas });
      if (!openRelatorioWindow(html)) {
        showToast(
          'error',
          'Pop-up bloqueado',
          'Permita pop-ups para esta página para visualizar o relatório.',
        );
        return;
      }
      showToast('success', 'Relatório gerado', `${notas.length} nota(s) — use Ctrl+P para salvar em PDF.`, 3000);
    } catch (err) {
      console.error('[Relatório] visualizar failed', err);
      showToast('error', 'Erro ao gerar relatório', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bnf-card">
      <Toast ref={toastRef} />
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          gap: 12,
          padding: '12px 0',
        }}
      >
        <div className="bnf-step-title" style={{ margin: '0 0 6px', minWidth: 128 }}>
          Relatório
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label htmlFor="relTipo" className="bnf-lbl">
            Tipo
          </label>
          <Dropdown
            inputId="relTipo"
            value={tipo}
            options={TIPO_OPTIONS}
            onChange={(e) => setTipo(e.value as RelatorioTipo)}
            style={{ minWidth: 120 }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label htmlFor="relAno" className="bnf-lbl">
            Ano
          </label>
          <Dropdown
            inputId="relAno"
            value={ano}
            options={ANO_OPTIONS}
            onChange={(e) => setAno(e.value as number | null)}
            placeholder="—"
            showClear
            style={{ minWidth: 80 }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label htmlFor="relMes" className="bnf-lbl">
            Mês
          </label>
          <Dropdown
            inputId="relMes"
            value={mes}
            options={MES_OPTIONS}
            onChange={(e) => setMes(e.value as number | null)}
            placeholder="—"
            showClear
            style={{ minWidth: 100 }}
          />
        </div>

        <Button
          size="small"
          outlined
          icon="pi pi-chart-bar"
          label="Visualizar Relatório"
          onClick={onVisualizar}
          loading={busy}
          style={{ whiteSpace: 'nowrap' }}
        />
      </div>
    </section>
  );
}
