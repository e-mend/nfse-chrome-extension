import { TabMenu } from 'primereact/tabmenu';

interface TabNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  const tabs = [
    { id: 'connection', label: 'Conexão' },
    { id: 'companies', label: 'Empresas' },
    { id: 'notas', label: 'Notas' },
    // { id: 'backup', label: 'Backup' }, Implementar futuramente
    // { id: 'download', label: 'Download' },
    { id: 'settings', label: 'Configurações' },
    { id: 'about', label: 'Sobre' },
  ];

  return (
    <div className="bnf-tab-navigation">
      <TabMenu 
        model={tabs} 
        activeIndex={tabs.findIndex(tab => tab.id === activeTab)} 
        onTabChange={(e) => onTabChange(tabs[e.index].id)}
      />
    </div>
  );
}
