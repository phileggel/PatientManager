import { SearchField } from "../field";

interface ManagerHeaderProps {
  searchId: string;
  title: string;
  count: number;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
}

export function ManagerHeader({
  searchId,
  title,
  count,
  searchTerm,
  onSearchChange,
  searchPlaceholder,
}: ManagerHeaderProps) {
  return (
    <div className="p-4 border-b border-m3-outline/5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-4 pl-2">
        <h2 className="text-2xl font-medium text-m3-on-surface">{title}</h2>
        <span className="px-3 py-1 bg-m3-primary-container text-m3-on-primary-container text-xs font-bold rounded-full">
          {count}
        </span>
      </div>
      <div className="max-w-md">
        <SearchField
          id={searchId}
          value={searchTerm}
          onChange={onSearchChange}
          placeholder={searchPlaceholder}
        />
      </div>
    </div>
  );
}
