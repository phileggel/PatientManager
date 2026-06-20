import { useTranslation } from "react-i18next";
import type { BankStatementLine, BankStatementReconciliation } from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";
import { Button } from "@/ui/components/button";
import { useFormatters } from "@/ui/format/formatters";
import { lineStatusTone, presentLineStatus } from "../shared/reconciliationPresenter";

interface ReconciliationListProps {
  reconciliation: BankStatementReconciliation;
  onApplyCorrection: (line: BankStatementLine) => void;
  isBusy: boolean;
  onOpenWizard?: () => void;
}

/**
 * BAS-060/061/069 — the draft reconciliation list: every credit line in document
 * order, one row each (date · fund · amount · status), with a running summary and
 * a wizard launcher.
 *
 * The status renders as a badge: gold (`attention`) for the four correction-needed
 * states so they stand out at a glance, subdued for resolved lines (Matched /
 * Rejected). Double-clicking any line opens it for correction (BAS-062) — including
 * Matched lines, which can be overridden. Interaction is suppressed while a recompute
 * is in flight (BAS-064 busy state).
 */
export function ReconciliationList({
  reconciliation,
  onApplyCorrection,
  isBusy,
  onOpenWizard,
}: ReconciliationListProps) {
  const { t } = useTranslation("bank");
  const { formatCurrency, formatDate } = useFormatters();
  const funds = useCacheStore((s) => s.funds);

  // Resolved fund name once linked; the raw bank label while still needs-link.
  const fundName = (line: BankStatementLine): string =>
    line.fund_id
      ? (funds.find((f) => f.id === line.fund_id)?.name ?? line.fund_id)
      : line.credit_line.label;

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
        {reconciliation.lines.map((line) => {
          const attention = lineStatusTone(line.status) === "attention";
          return (
            <li
              key={line.line_id}
              id={`reconciliation-line-row-${line.line_id}`}
              className="grid grid-cols-[5rem_1fr_auto_auto] items-center gap-4 rounded-lg border border-m3-outline/20 px-4 py-3 cursor-pointer"
              onDoubleClick={() => {
                if (isBusy) return;
                onApplyCorrection(line);
              }}
            >
              <span className="text-xs text-m3-on-surface-variant tabular-nums">
                {formatDate(line.credit_line.date)}
              </span>
              <span className="text-sm font-medium text-m3-on-surface truncate">
                {fundName(line)}
              </span>
              <span className="text-sm text-m3-on-surface tabular-nums text-right">
                {formatCurrency(line.credit_line.amount)}
              </span>
              <span
                id={`reconciliation-line-status-${line.line_id}`}
                className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-medium ${
                  attention
                    ? "bg-m3-tertiary-container text-m3-on-tertiary-container"
                    : "bg-m3-surface-container-high text-m3-on-surface-variant"
                }`}
              >
                {t(presentLineStatus(line.status))}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
