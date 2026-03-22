import type { InputHTMLAttributes } from "react";

/**
 * InputLegacy - Deprecated Component
 *
 * DEPRECATED: Use TextField with the M3 design system instead.
 *
 * TODO: Refactor consumers to use TextField and remove this component.
 * Consumers:
 * - src/features/shared/ui/ProcedureTypeForm.tsx
 * - src/features/procedure/ui/form/CreateFundForm.tsx
 * - src/features/procedure/ui/form/CreatePatientForm.tsx
 * - (ProcedureUpdateModal replaced by ProcedureFormModal)
 *
 * This component uses outdated styling (border + rounded) instead of M3 design tokens.
 * This component exists only for backward compatibility during refactoring.
 */
interface InputLegacyProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  id: string;
  label?: string;
  error?: string;
}

export function InputLegacy({
  id,
  label,
  type = "text",
  required = false,
  error,
  ...props
}: InputLegacyProps) {
  const fieldClasses = `
    w-full h-11 px-4 py-3
    border rounded
    text-sm font-medium leading-5
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
      <input id={id} type={type} required={required} className={fieldClasses} {...props} />
      {error && <span className="text-m3-error text-xs font-medium tracking-wide">{error}</span>}
    </div>
  );
}
