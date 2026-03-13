import { ChevronDown } from "lucide-react";
import type { ReactNode, SelectHTMLAttributes } from "react";

/**
 * SelectFieldLegacy - Deprecated Component
 *
 * DEPRECATED: This component supports the old pattern of passing children as <option> elements.
 * Use SelectField with the `options` prop instead.
 *
 * TODO: Refactor consumers to use SelectField with options prop and remove this component.
 * Consumers: none remaining — safe to delete.
 *
 * This component exists only for backward compatibility during refactoring.
 */
interface SelectFieldLegacyProps extends SelectHTMLAttributes<HTMLSelectElement> {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}

export function SelectFieldLegacy({
  id,
  label,
  error,
  children,
  className = "",
  ...props
}: SelectFieldLegacyProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="m3-input-label">
        {label}
      </label>
      <div className="relative group">
        <select
          id={id}
          className={`m3-input w-full appearance-none cursor-pointer ${error ? "border-m3-error" : ""} ${className}`}
          {...props}
        >
          {children}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-m3-on-surface-variant group-focus-within:text-m3-primary transition-colors">
          <ChevronDown size={20} />
        </div>
      </div>
      {error && <span className="text-xs text-m3-error px-1">{error}</span>}
    </div>
  );
}
