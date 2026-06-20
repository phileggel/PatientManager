import { useTranslation } from "react-i18next";
import type { BankStatementLine, BankStatementReconciliation } from "@/bindings";
import { Button } from "@/ui/components/button";
import { presentLineStatus } from "../shared/reconciliationPresenter";

interface ReconciliationListProps {
  reconciliation: BankStatementReconciliation;
  onApplyCorrection: (line: BankStatementLine) => void;
  isBusy: boolean;
  onOpenWizard?: () => void;
}

/**
 * BAS-060/061/069 — the draft reconciliation list: every credit line in document
 * order with its per-line status, a running summary, and a wizard launcher.
 *
 * Double-clicking any line opens it for correction (BAS-062) — including Matched
 * lines, which can be overridden. Interaction is suppressed while a recompute is
 * in flight (BAS-064 busy state).
 */
export function ReconciliationList({
  reconciliation,
  onApplyCorrection,
  isBusy,
  onOpenWizard,
}: ReconciliationListProps) {
  const { t } = useTranslation("bank");

  return (
    <div id="reconciliation-list">
      <div className="flex items-center justify-between mb-3">
        <output id="reconciliation-summary" className="text-sm text-m3-on-surface-variant">
          {t("reconciliation.summary", {
            resolved: reconciliation.resolved_count,
            needsCorrection: reconciliation.needs_correction_count,
          })}
        </output>
        {onOpenWizard && (
          <Button
            id="reconciliation-wizard-btn"
            variant="primary"
            onClick={onOpenWizard}
            disabled={isBusy}
          >
            {t("reconciliation.wizard.open")}
          </Button>
        )}
      </div>

      <ul className="flex flex-col gap-1">
        {reconciliation.lines.map((line) => (
          <li
            key={line.line_id}
            id={`reconciliation-line-row-${line.line_id}`}
            className="flex items-center justify-between rounded-lg border border-m3-outline/20 px-4 py-3 cursor-pointer"
            onDoubleClick={() => {
              if (isBusy) return;
              onApplyCorrection(line);
            }}
          >
            <div className="flex flex-col">
              <span className="text-sm font-medium text-m3-on-surface">
                {line.credit_line.label}
              </span>
              <span className="text-xs text-m3-on-surface-variant">{line.credit_line.date}</span>
            </div>
            <span
              id={`reconciliation-line-status-${line.line_id}`}
              className="text-xs font-semibold text-m3-on-surface-variant"
            >
              {t(presentLineStatus(line.status))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
