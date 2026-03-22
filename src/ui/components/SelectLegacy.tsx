import type { SelectHTMLAttributes } from "react";

/**
 * SelectLegacy - Deprecated Component
 *
 * DEPRECATED: Use SelectField with the `options` prop instead.
 *
 * TODO: Refactor consumers to use SelectField with options prop and remove this component.
 * Consumers:
 * - (none — ProcedureUpdateModal replaced by ProcedureFormModal)
 *
 * This component uses outdated styling (border + rounded) instead of M3 design tokens.
 * This component accepts children as <option> elements instead of an options prop.
 * This component exists only for backward compatibility during refactoring.
 */
interface SelectLegacyProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> {
  id: string;
  label?: string;
  error?: string;
}

export function SelectLegacy({
  id,
  label,
  required = false,
  error,
  children,
  ...props
}: SelectLegacyProps) {
  const fieldClasses = `
    w-full h-14 px-4 py-3
    border rounded
    text-sm font-medium leading-6
    text-m3-on-surface bg-m3-surface
    transition-colors duration-150 ease-out
    focus:outline-none focus:border-m3-primary focus:ring-[3px] focus:ring-m3-primary/10
    disabled:bg-m3-surface-container-low disabled:text-m3-on-surface/50 disabled:cursor-not-allowed
    ${error ? "border-m3-error focus:ring-m3-error/10" : "border-m3-outline"}
  `;

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <label htmlFor={id} className="text-sm font-medium tracking-wide text-m3-on-surface">
          {label}
          {required && <span className="text-m3-error ml-1">*</span>}
        </label>
      )}
      <select id={id} required={required} className={fieldClasses} {...props}>
        {children}
      </select>
      {error && <span className="text-m3-error text-xs font-medium tracking-wide">{error}</span>}
    </div>
  );
}
