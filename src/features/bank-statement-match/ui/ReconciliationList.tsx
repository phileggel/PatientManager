import { useState } from "react";
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
 * order as a table row (date · fund · amount · status), with a running summary and
 * a wizard launcher.
 *
 * The status renders as a badge: gold (`attention`) for the four correction-needed
 * states so they stand out at a glance, subdued for resolved lines (Matched /
 * Rejected). Double-clicking any row opens it for correction (BAS-062) — including
 * Matched rows, which can be overridden. Interaction is suppressed while a recompute
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
  // BAS-069 — optional filter hiding resolved (Matched / Rejected) rows; the
  // underlying document order of the shown rows is untouched.
  const [hideResolved, setHideResolved] = useState(false);

  const visibleLines = hideResolved
    ? reconciliation.lines.filter((line) => lineStatusTone(line.status) !== "resolved")
    : reconciliation.lines;

  // Resolved fund name once linked; the raw bank label while still needs-link
  // (rendered muted+italic so it cannot be mistaken for a fund name).
  const fundCell = (line: BankStatementLine) =>
    line.fund_id ? (
      <span className="font-medium text-m3-on-surface">
        {funds.find((f) => f.id === line.fund_id)?.name ?? line.fund_id}
      </span>
    ) : (
      <span className="italic text-m3-on-surface-variant">{line.credit_line.label}</span>
    );

  return (
    <div id="reconciliation-list">
      <div className="flex items-center justify-between mb-3">
        <output id="reconciliation-summary" className="text-sm text-m3-on-surface-variant">
          {t("reconciliation.summary", {
            resolved: reconciliation.resolved_count,
            needsCorrection: reconciliation.needs_correction_count,
          })}
        </output>
        <div className="flex items-center gap-3">
          <label
            htmlFor="reconciliation-hide-resolved"
            className="flex items-center gap-2 text-sm text-m3-on-surface-variant cursor-pointer"
          >
            <input
              id="reconciliation-hide-resolved"
              type="checkbox"
              checked={hideResolved}
              onChange={(e) => setHideResolved(e.target.checked)}
            />
            {t("reconciliation.hide_resolved")}
          </label>
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
      </div>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-xs text-m3-on-surface-variant">
            <th className="text-left font-medium px-4 py-2">{t("reconciliation.col.date")}</th>
            <th className="text-left font-medium px-4 py-2">{t("reconciliation.col.fund")}</th>
            <th className="text-right font-medium px-4 py-2">{t("reconciliation.col.amount")}</th>
            <th className="text-right font-medium px-4 py-2">{t("reconciliation.col.status")}</th>
          </tr>
        </thead>
        <tbody>
          {visibleLines.map((line) => {
            const tone = lineStatusTone(line.status);
            // Three visually distinct badge families: fund unknown (link, primary),
            // transaction missing (attention, gold), resolved (subdued).
            const badgeClass =
              tone === "link"
                ? "bg-m3-primary-container text-m3-on-primary-container"
                : tone === "attention"
                  ? "bg-m3-tertiary-container text-m3-on-tertiary-container"
                  : "bg-m3-surface-container-high text-m3-on-surface-variant";
            return (
              <tr
                key={line.line_id}
                id={`reconciliation-line-row-${line.line_id}`}
                className="cursor-pointer border-b border-m3-outline/15 hover:bg-m3-surface-container-low"
                onDoubleClick={() => {
                  if (isBusy) return;
                  onApplyCorrection(line);
                }}
              >
                <td className="px-4 py-3 text-m3-on-surface-variant tabular-nums whitespace-nowrap">
                  {formatDate(line.credit_line.date)}
                </td>
                <td className="px-4 py-3">{fundCell(line)}</td>
                <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap text-m3-on-surface">
                  {formatCurrency(line.credit_line.amount)}
                </td>
                <td className="px-4 py-3 text-right">
                  <span
                    id={`reconciliation-line-status-${line.line_id}`}
                    className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-medium ${badgeClass}`}
                  >
                    {t(presentLineStatus(line.status))}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
