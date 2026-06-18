import { EmpresasCard } from './EmpresasCard';
import { RelatorioCard } from './RelatorioCard';

export function CompaniesTab() {
  return (
    <div className="bnf-tab-content">
      <EmpresasCard />
      <RelatorioCard />
    </div>
  );
}