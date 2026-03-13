import { AlertCircle, Check, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/lib/appStore";
import { logger } from "@/lib/logger";
import { getBankStatementReconciliationConfig } from "../gateway";
import type { IdentifiableCreditLine } from "./BankStatementModal";

interface MatchResultsStepProps {
  lines: IdentifiableCreditLine[];
  userSelections: Map<string, string | null>; // lineId -> groupId
  onSelectionChange: (lineId: string, groupId: string | null) => void;
}

/**
 * Helper to calculate day difference between two ISO dates (YYYY-MM-DD)
 */
function getDaysDiff(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function MatchResultsStep({
  lines,
  userSelections,
  onSelectionChange,
}: MatchResultsStepProps) {
  const { t } = useTranslation("bank");
  const funds = useAppStore((state) => state.funds);
  const allGroups = useAppStore((state) => state.fundPaymentGroups);

  // Track which lines have expanded search (to all funds) active
  const [expandedLines, setExpandedLines] = useState<Set<string>>(new Set());
  const [maxDateOffsetDays, setMaxDateOffsetDays] = useState(6); // Default, will be overridden

  // Load config from backend
  useEffect(() => {
    getBankStatementReconciliationConfig()
      .then((config) => {
        setMaxDateOffsetDays(config.max_date_offset_days);
      })
      .catch((err) => {
        logger.error("Failed to load bank statement reconciliation config, using default", {
          error: err,
        });
        setMaxDateOffsetDays(6);
      });
  }, []);

  const getFundName = (fundId: string): string => {
    const fund = funds.find((f) => f.id === fundId);
    return fund ? `${fund.fund_identifier} - ${fund.name}` : fundId;
  };

  const toggleExpandedSearch = (lineId: string) => {
    setExpandedLines((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) {
        next.delete(lineId);
      } else {
        next.add(lineId);
      }
      return next;
    });
  };

  // Track which groups are already assigned to other lines to prevent double-assignment
  const assignedGroupIds = new Set(
    Array.from(userSelections.values()).filter((id): id is string => id !== null),
  );

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex gap-4">
        <div className="flex-1 p-4 rounded-lg bg-success-10 border border-success-30 text-center">
          <p className="text-2xl font-bold text-success-70">
            {Array.from(userSelections.values()).filter((id) => id !== null).length}
          </p>
          <p className="text-sm text-success-70">{t("statement.matchResults.matched")}</p>
        </div>
        <div className="flex-1 p-4 rounded-lg bg-warning-10 border border-warning-30 text-center">
          <p className="text-2xl font-bold text-warning-90">
            {Array.from(userSelections.values()).filter((id) => id === null).length}
          </p>
          <p className="text-sm text-warning-90">{t("statement.matchResults.unmatched")}</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-neutral-20 bg-neutral-5">
              <th className="text-left py-3 px-4 font-medium text-neutral-60">
                {t("statement.matchResults.columns.line")}
              </th>
              <th className="text-left py-3 px-4 font-medium text-neutral-60">
                {t("statement.matchResults.columns.group", { days: maxDateOffsetDays })}
              </th>
              <th className="text-center py-3 px-4 font-medium text-neutral-60 w-16">
                {t("statement.matchResults.columns.status")}
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const selectedGroupId = userSelections.get(line.lineId) || null;
              const isExpanded = expandedLines.has(line.lineId);

              // Find candidates for this line:
              // 1. Same fund (if not expanded)
              // 2. Within ± max_date_offset_days (from backend config)
              const candidates = allGroups.filter(
                (g) =>
                  (isExpanded || g.fund_id === line.fund_id) &&
                  getDaysDiff(g.payment_date, line.date) <= maxDateOffsetDays,
              );

              // Sort candidates: those with exact amount first, then by date proximity
              const sortedCandidates = [...candidates].sort((a, b) => {
                const aExact = a.total_amount === line.amount;
                const bExact = b.total_amount === line.amount;
                if (aExact && !bExact) return -1;
                if (!aExact && bExact) return 1;
                return (
                  getDaysDiff(a.payment_date, line.date) - getDaysDiff(b.payment_date, line.date)
                );
              });

              const isMatched = selectedGroupId !== null;

              return (
                <tr
                  key={line.lineId}
                  className={`border-b border-neutral-10 transition-colors ${
                    isMatched ? "bg-success-5" : "bg-warning-5"
                  }`}
                >
                  <td className="py-4 px-4 align-top">
                    <div className="space-y-1">
                      <p className="font-medium text-neutral-90">{line.date}</p>
                      <p
                        className="text-xs font-mono text-neutral-60 truncate max-w-[200px]"
                        title={line.label}
                      >
                        {line.label}
                      </p>
                      <p className="font-semibold text-primary-60">
                        {(line.amount / 1000).toFixed(2)} &euro;
                      </p>
                      <p className="text-xs text-neutral-50 italic">{getFundName(line.fund_id)}</p>
                    </div>
                  </td>
                  <td className="py-4 px-4 align-top">
                    <div className="space-y-3">
                      <div className="flex flex-col gap-2">
                        <select
                          value={selectedGroupId || ""}
                          onChange={(e) => onSelectionChange(line.lineId, e.target.value || null)}
                          className={`m3-input w-full appearance-none cursor-pointer text-sm ${
                            isMatched ? "border-success-40" : "border-warning-40"
                          }`}
                        >
                          <option value="">{t("statement.matchResults.select.placeholder")}</option>
                          {sortedCandidates.map((cand) => {
                            const isUsedByOther =
                              assignedGroupIds.has(cand.id) && selectedGroupId !== cand.id;
                            const isExactAmount = cand.total_amount === line.amount;
                            const candFund = funds.find((f) => f.id === cand.fund_id);

                            return (
                              <option key={cand.id} value={cand.id} disabled={isUsedByOther}>
                                {cand.payment_date} - {(cand.total_amount / 1000).toFixed(2)}€
                                {isExpanded ? ` [${candFund?.fund_identifier || "?"}]` : ""}
                                {isExactAmount
                                  ? t("statement.matchResults.option.exactAmount")
                                  : ""}
                                {isUsedByOther
                                  ? t("statement.matchResults.option.alreadyUsed")
                                  : ""}
                              </option>
                            );
                          })}
                        </select>

                        <button
                          type="button"
                          onClick={() => toggleExpandedSearch(line.lineId)}
                          className={`text-xs font-medium self-start px-2 py-1 rounded transition-colors ${
                            isExpanded
                              ? "bg-primary-60 text-white"
                              : "text-primary-60 hover:bg-primary-10"
                          }`}
                        >
                          {isExpanded
                            ? t("statement.matchResults.search.active")
                            : t("statement.matchResults.search.expand")}
                        </button>
                      </div>

                      {selectedGroupId && (
                        <div className="flex items-start gap-2 p-2 rounded bg-white/50 border border-neutral-20">
                          <Check className="w-4 h-4 text-success-60 shrink-0 mt-0.5" />
                          <div className="text-xs text-neutral-70">
                            {t("statement.matchResults.match.confirmed", {
                              date: allGroups.find((g) => g.id === selectedGroupId)?.payment_date,
                            })}
                          </div>
                        </div>
                      )}

                      {!selectedGroupId && sortedCandidates.length > 0 && (
                        <div className="flex items-start gap-2 p-2 rounded bg-warning-10 border border-warning-20">
                          <AlertCircle className="w-4 h-4 text-warning-70 shrink-0 mt-0.5" />
                          <p className="text-xs text-warning-80">
                            {isExpanded
                              ? t("statement.matchResults.candidates.foundAllFunds", {
                                  count: sortedCandidates.length,
                                  days: maxDateOffsetDays,
                                })
                              : t("statement.matchResults.candidates.found", {
                                  count: sortedCandidates.length,
                                  days: maxDateOffsetDays,
                                })}
                          </p>
                        </div>
                      )}

                      {!selectedGroupId && sortedCandidates.length === 0 && (
                        <div className="flex items-start gap-2 p-2 rounded bg-neutral-10 border border-neutral-20">
                          <Search className="w-4 h-4 text-neutral-50 shrink-0 mt-0.5" />
                          <p className="text-xs text-neutral-60 italic">
                            {t("statement.matchResults.candidates.none", {
                              days: maxDateOffsetDays,
                            })}
                          </p>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-4 text-center align-top">
                    {isMatched ? (
                      <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-success-60 text-white">
                        <Check size={18} />
                      </div>
                    ) : (
                      <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-warning-20 text-warning-80">
                        <AlertCircle size={18} />
                      </div>
                    )}
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
