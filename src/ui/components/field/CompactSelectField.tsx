import { ChevronDown } from "lucide-react";
import type { SelectHTMLAttributes } from "react";

interface CompactSelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  id: string;
}

export function CompactSelectField({
  id,
  children,
  className = "",
  ...props
}: CompactSelectFieldProps) {
  return (
    <div className="relative group">
      <select
        id={id}
        className={`appearance-none cursor-pointer bg-m3-surface-container text-m3-on-surface text-sm px-3 py-1.5 pr-7 rounded-lg border border-m3-outline-variant focus:outline-none focus:border-m3-primary transition-colors ${className}`}
        {...props}
      >
        {children}
      </select>
      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-m3-on-surface-variant group-focus-within:text-m3-primary transition-colors">
        <ChevronDown size={16} />
      </div>
    </div>
  );
}
