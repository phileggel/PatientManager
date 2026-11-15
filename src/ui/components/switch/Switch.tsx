interface SwitchProps {
  /** Stable id; F25 — `{feature}-{component}-{role}`. */
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** The visible label beside the switch (already translated). */
  label: string;
  disabled?: boolean;
}

/**
 * Switch — an M3 on/off control for a yes/no state that applies at once
 * (#697: « Ignorer » a bank statement label). A checkbox stays the control for
 * a choice confirmed later (a selection, a filter).
 */
export function Switch({ id, checked, onChange, label, disabled = false }: SwitchProps) {
  return (
    <span className="inline-flex items-center gap-2">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 transition-colors disabled:opacity-50 ${
          checked
            ? "border-m3-primary bg-m3-primary"
            : "border-m3-outline bg-m3-surface-container-highest"
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute rounded-full transition-all ${
            checked ? "left-[22px] h-4 w-4 bg-m3-on-primary" : "left-1 h-3 w-3 bg-m3-outline"
          }`}
        />
      </button>
      <span id={`${id}-label`} className="text-sm leading-none text-m3-on-surface-variant">
        {label}
      </span>
    </span>
  );
}
