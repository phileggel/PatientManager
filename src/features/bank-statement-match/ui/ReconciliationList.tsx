import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { BankStatementLine, BankStatementReconciliation } from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";
import { Tag } from "@/ui/components/tag/Tag";
import { useFormatters } from "@/ui/format/formatters";
import { lineTagTone, presentLineBadge } from "../shared/reconciliationPresenter";

interface ReconciliationListProps {
  reconciliation: BankStatementReconciliation;
  /** Opens a line's « Rapprocher » modal. */
  onApplyCorrection: (line: BankStatementLine) => void;
  isBusy: boolean;
}

/**
 * #692, step 3 — every line of the statement in document order (BAS-060): date,
 * fund, amount, a status tag of one width in the import's colour meaning. An
 * ignored label's line is greyed out and does not open. A line opens by
 * double-click or Enter. « Masquer les lignes décidées » leaves only the lines
 * to match; the list is the step's only scrollable region.
 */
export function ReconciliationList({
  reconciliation,
  onApplyCorrection,
  isBusy,
}: ReconciliationListProps) {
  const { t } = useTranslation("bank");
  const { formatCurrency, formatDate } = useFormatters();
  const funds = useCacheStore((s) => s.funds);
  const [hideDecided, setHideDecided] = useState(false);

  const toMatch = reconciliation.lines.filter((line) => lineTagTone(line) === "action");
  const visibleLines = hideDecided ? toMatch : reconciliation.lines;

  const open = (line: BankStatementLine) => {
    if (isBusy || line.status === "Rejected") return;
    onApplyCorrection(line);
  };

  return (
    <div id="reconciliation-list" className="flex flex-col flex-1 min-h-0">
      <div className="mb-3 flex items-center justify-between">
        <output id="reconciliation-summary" className="text-sm text-m3-on-surface-variant">
          {t("reconciliation.to_match", { count: toMatch.length })} ·{" "}
          {t("reconciliation.double_click_hint")}
        </output>
        <label
          htmlFor="reconciliation-hide-resolved"
          className="flex cursor-pointer items-center gap-2 text-sm text-m3-on-surface-variant"
        >
          <input
            id="reconciliation-hide-resolved"
            type="checkbox"
            checked={hideDecided}
            onChange={(e) => setHideDecided(e.target.checked)}
          />
          {t("reconciliation.hide_resolved")}
        </label>
      </div>

      <div
        id="reconciliation-list-scrollzone"
        className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-m3-outline/15"
      >
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-xs text-m3-on-surface-variant">
              {(["date", "fund", "amount", "status"] as const).map((column, index) => (
                <th
                  key={column}
                  className={`sticky top-0 bg-m3-surface-container-lowest px-4 py-2 font-medium ${index >= 2 ? "text-right" : "text-left"}`}
                >
                  {t(`reconciliation.col.${column}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleLines.map((line) => {
              const rejected = line.status === "Rejected";
              const fundName = line.fund_id ? funds.find((f) => f.id === line.fund_id)?.name : null;
              return (
                <tr
                  key={line.line_id}
                  id={`reconciliation-line-row-${line.line_id}`}
                  tabIndex={rejected ? -1 : 0}
                  aria-disabled={rejected || undefined}
                  className={`border-b border-m3-outline/15 ${
                    rejected
                      ? "opacity-50"
                      : "cursor-pointer hover:bg-m3-surface-container-high focus:bg-m3-surface-container-high focus:outline-none"
                  }`}
                  onDoubleClick={() => open(line)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") open(line);
                  }}
                >
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-m3-on-surface-variant">
                    {formatDate(line.credit_line.date)}
                  </td>
                  <td className="px-4 py-3">
                    {fundName ? (
                      <span className="font-medium text-m3-on-surface">{fundName}</span>
                    ) : (
                      <span className="italic text-m3-on-surface-variant">
                        {line.credit_line.label}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-m3-on-surface">
                    {formatCurrency(line.credit_line.amount)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Tag
                      id={`reconciliation-line-status-${line.line_id}`}
                      tone={lineTagTone(line)}
                      className="w-34"
                    >
                      {t(presentLineBadge(line))}
                    </Tag>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
