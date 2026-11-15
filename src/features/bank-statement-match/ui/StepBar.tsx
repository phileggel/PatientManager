import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

export type ImportStep = "import" | "labels" | "matching" | "recap";

const STEPS: ImportStep[] = ["import", "labels", "matching", "recap"];

/**
 * #692 — the bank statement import's four steps, one width each, packed left,
 * no connecting line: a done step is a green circle with its check, the current
 * one purple with its number, the next ones grey.
 */
export function StepBar({ current }: { current: ImportStep }) {
  const { t } = useTranslation("bank");
  const currentIndex = STEPS.indexOf(current);
  return (
    <ol
      id="bank-statement-steps"
      className="flex items-center pb-4 mb-2 border-b border-m3-outline/20"
    >
      {STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li
            key={step}
            id={`bank-statement-step-${step}`}
            aria-current={active ? "step" : undefined}
            className="flex w-52 items-center gap-2"
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                done
                  ? "bg-[var(--color-snackbar-success-bg)] text-[var(--color-snackbar-success-text)]"
                  : active
                    ? "bg-m3-primary-container text-m3-on-primary-container ring-2 ring-m3-primary"
                    : "bg-m3-surface-container-high text-m3-on-surface-variant"
              }`}
            >
              {done ? <Check size={14} /> : index + 1}
            </span>
            <span
              className={`whitespace-nowrap text-sm ${
                active ? "font-semibold text-m3-on-surface" : "text-m3-on-surface-variant"
              }`}
            >
              {t(`reconciliation.steps.${step}`)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
