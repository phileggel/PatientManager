import { ManagerHeader } from "./ManagerHeader";

interface ManagerLayoutProps {
  // Partie Gauche (Liste)
  searchId: string;
  title: string;
  count: number;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  table: React.ReactNode;

  // Partie Droite (Panneau d'action)
  sidePanelTitle: string;
  sidePanelIcon: React.ReactNode;
  sidePanelContent: React.ReactNode;
  sidePanelDescription?: string;
}

export function ManagerLayout({
  searchId,
  title,
  count,
  searchTerm,
  onSearchChange,
  searchPlaceholder,
  table,
  sidePanelTitle,
  sidePanelIcon,
  sidePanelContent,
  sidePanelDescription,
}: ManagerLayoutProps) {
  return (
    <div className="flex h-full gap-4 overflow-hidden py-2 px-2">
      {/* Left List */}
      <div className="flex-1 flex flex-col min-w-0 bg-m3-surface-container rounded-[28px] border border-m3-outline/10 shadow-sm overflow-hidden">
        <ManagerHeader
          searchId={searchId}
          title={title}
          count={count}
          searchTerm={searchTerm}
          onSearchChange={onSearchChange}
          searchPlaceholder={searchPlaceholder}
        />
        <div className="flex-1 overflow-auto">{table}</div>
      </div>

      {/* Right add form */}
      <div className="w-96 flex flex-col bg-m3-surface-container-high rounded-4xl border border-m3-outline/10 shadow-sm shrink-0 overflow-hidden">
        <div className="p-4 border-b border-m3-outline/5 bg-m3-surface-container-high/50">
          <div className="flex items-center gap-4 mb-1">
            <div className="p-2 bg-m3-primary-container text-m3-on-primary-container rounded-xl">
              {sidePanelIcon}
            </div>
            <h2 className="text-xl font-bold text-m3-on-surface">{sidePanelTitle}</h2>
          </div>
          {sidePanelDescription && (
            <p className="text-sm text-m3-on-surface-variant ml-14">{sidePanelDescription}</p>
          )}
        </div>

        <div className="p-4 overflow-y-auto custom-scrollbar flex-1">{sidePanelContent}</div>
      </div>
    </div>
  );
}
