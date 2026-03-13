import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useAmountField - Logic for the AmountField component.
 *
 * Manages locale-aware formatting (number → display string) and parsing
 * (display string → number) using Intl.NumberFormat.
 * Syncs display value when the value prop changes from outside (controlled).
 * Normalizes display on blur (e.g., "42,5" → "42,50").
 */
export function useAmountField(
  value: number | null,
  onChange: (value: number | null) => void,
  locale: string,
) {
  const [displayValue, setDisplayValue] = useState(
    value != null ? formatAmount(value, locale) : "",
  );

  // Ref to read displayValue in the effect without adding it as a dependency.
  // This avoids re-syncing on every user keystroke while still responding to external changes.
  const displayRef = useRef(displayValue);
  displayRef.current = displayValue;

  // Sync display value only when the value changes from outside (not from user typing).
  // Comparing parsed displayValue vs incoming value avoids overwriting mid-input.
  useEffect(() => {
    const currentParsed = displayRef.current ? parseAmount(displayRef.current, locale) : null;
    if (value !== currentParsed) {
      setDisplayValue(value != null ? formatAmount(value, locale) : "");
    }
  }, [value, locale]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const parts = new Intl.NumberFormat(locale).formatToParts(1.1);
      const decimal = parts.find((p) => p.type === "decimal")?.value ?? ".";
      // Normalize numpad "." to locale decimal separator (e.g. "," in fr-FR)
      const raw = decimal !== "." ? e.target.value.replace(".", decimal) : e.target.value;
      setDisplayValue(raw);
      onChange(parseAmount(raw, locale));
    },
    [onChange, locale],
  );

  const handleBlur = useCallback(() => {
    if (!displayValue) return;
    const parsed = parseAmount(displayValue, locale);
    if (parsed != null) {
      setDisplayValue(formatAmount(parsed, locale));
      onChange(parsed);
    }
  }, [displayValue, onChange, locale]);

  const clearAmount = useCallback(() => {
    setDisplayValue("");
    onChange(null);
  }, [onChange]);

  const placeholder = formatAmount(0, locale);

  return { displayValue, placeholder, handleChange, handleBlur, clearAmount };
}

function formatAmount(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function parseAmount(raw: string, locale: string): number | null {
  const parts = new Intl.NumberFormat(locale).formatToParts(1234.5);
  const group = parts.find((p) => p.type === "group")?.value ?? "";
  const decimal = parts.find((p) => p.type === "decimal")?.value ?? ".";

  const normalized = raw.replace(new RegExp(`\\${group}`, "g"), "").replace(decimal, ".");

  const result = parseFloat(normalized);
  return Number.isNaN(result) ? null : result;
}
