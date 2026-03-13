import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAmountField } from "./useAmountField";

interface AmountFieldProps {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  error?: string;
  disabled?: boolean;
  locale?: string;
}

/**
 * AmountField - M3 Design System Amount Input Component
 *
 * Locale-aware decimal input field. Accepts and emits number | null internally
 * while displaying a locale-formatted string (e.g., "42,50" in fr-FR).
 * Normalizes display on blur. Provides a clear [X] button when a value is set.
 *
 * Internal: number | null (e.g., 42.5)
 * Display:  locale string (e.g., "42,50" for fr-FR, "42.50" for en-US)
 *
 * @example
 * <AmountField
 *   id="procedureAmount"
 *   label="Amount"
 *   value={amount}
 *   onChange={setAmount}
 *   error={errors.amount}
 * />
 */
export function AmountField({
  id,
  label,
  value,
  onChange,
  error,
  disabled = false,
  locale = "fr-FR",
}: AmountFieldProps) {
  const { t } = useTranslation("common");
  const { displayValue, placeholder, handleChange, handleBlur, clearAmount } = useAmountField(
    value,
    onChange,
    locale,
  );

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="m3-input-label">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          className={`m3-input w-full pr-8 ${error ? "border-m3-error" : ""}`}
          value={displayValue}
          onChange={handleChange}
          onBlur={handleBlur}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={t("field.amountAriaLabel")}
        />
        {displayValue && !disabled && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              clearAmount();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-m3-on-surface-variant hover:text-m3-on-surface transition-colors"
            aria-label={t("field.clearAriaLabel")}
          >
            <X size={14} />
          </button>
        )}
      </div>
      {error && <p className="text-xs text-m3-error mt-1 ml-1">{error}</p>}
    </div>
  );
}
