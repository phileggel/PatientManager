/**
 * SingleMatchCard - Issue card for a PDF line with one matching procedure but anomalies.
 *
 * Displays a side-by-side comparison table (PDF vs recorded procedure).
 * One action button per unresolved anomaly (amount, fund, date).
 *
 * Sources: acceptedKeys, autoCorrections (parent correction state), onAcceptCorrection callback.
 */

import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AutoCorrection, DbMatch, NormalizedPdfLine } from "@/bindings";
import { Button } from "@/ui/components/button";
import {
  buildAutoCorrection,
  buildContestCorrection,
  buildContestKey,
  buildCorrectionKey,
  formatAmount,
  formatProcedureDateFromLine,
} from "../../shared/utils";
import { IssueChip, PdfSummary, ResolvedBadge } from "./CardParts";

interface SingleMatchCardProps {
  pdfLine: NormalizedPdfLine;
  dbMatch: DbMatch;
  acceptedKeys: Set<string>;
  autoCorrections: Map<string, AutoCorrection>;
  onAcceptCorrection: (key: string, correction: AutoCorrection) => void;
}

function anomalyBadgeLabel(anomaly: string, t: (k: string) => string): string {
  if (anomaly === "AmountMismatch") return t("results.badge.amountMismatch");
  if (anomaly === "FundMismatch") return t("results.badge.fundMismatch");
  return t("results.badge.dateMismatch");
}

export function SingleMatchCard({
  pdfLine,
  dbMatch,
  acceptedKeys,
  autoCorrections,
  onAcceptCorrection,
}: SingleMatchCardProps) {
  const { t } = useTranslation("fund-payment-match");

  const contestKey = buildContestKey(dbMatch.procedure_id);
  const contested = acceptedKeys.has(contestKey);

  const allAnomaliesResolved = dbMatch.anomalies.every((a) => {
    if (a === "AmountMismatch") {
      return acceptedKeys.has(buildCorrectionKey(a, dbMatch.procedure_id)) || contested;
    }
    return acceptedKeys.has(buildCorrectionKey(a, dbMatch.procedure_id));
  });
  const corrAmount = autoCorrections.get(
    buildCorrectionKey("AmountMismatch", dbMatch.procedure_id),
  );
  const effectiveAmount =
    corrAmount && "AmountMismatch" in corrAmount
      ? corrAmount.AmountMismatch.pdf_amount
      : dbMatch.amount || 0;
  const amountOk = contested || pdfLine.amount === effectiveAmount;
  const isResolved = allAnomaliesResolved && amountOk;

  const unresolvedAnomaly = dbMatch.anomalies.find(
    (a) => !acceptedKeys.has(buildCorrectionKey(a, dbMatch.procedure_id)),
  );
  const chipLabel = unresolvedAnomaly
    ? anomalyBadgeLabel(unresolvedAnomaly, t)
    : t("results.issueType.singleMatch");

  return (
    <div className="m3-card-elevated space-y-4">
      <div className="flex items-start justify-between gap-3">
        <IssueChip label={chipLabel} variant="warning" />
        {isResolved && <ResolvedBadge label={t("results.resolved.label")} />}
      </div>

      <PdfSummary line={pdfLine} />

      {/* Comparison table */}
      <div className="rounded-lg border border-m3-outline/20 overflow-hidden">
        <div className="grid grid-cols-3 bg-m3-surface-container px-4 py-2 text-[11px] font-semibold text-m3-on-surface-variant uppercase tracking-wide">
          <span />
          <span className="text-center text-m3-primary">{t("results.pdf.label")}</span>
          <span className="text-center">{t("results.db.label")}</span>
        </div>

        {dbMatch.anomalies.map((anomaly) => {
          const key = buildCorrectionKey(anomaly, dbMatch.procedure_id);
          const accepted = acceptedKeys.has(key);
          const pdfValue =
            anomaly === "AmountMismatch"
              ? `${formatAmount(pdfLine.amount)} €`
              : anomaly === "FundMismatch"
                ? pdfLine.fund_name
                : formatProcedureDateFromLine(pdfLine);
          const dbValue =
            anomaly === "AmountMismatch"
              ? `${formatAmount(dbMatch.amount || 0)} €`
              : anomaly === "FundMismatch"
                ? (dbMatch.fund_id ?? "—")
                : dbMatch.procedure_date;

          return (
            <div
              key={anomaly}
              className="grid grid-cols-3 items-center px-4 py-3 border-t border-m3-outline/10 gap-2"
            >
              <span className="text-xs font-medium text-m3-on-surface-variant">
                {anomalyBadgeLabel(anomaly, t)}
              </span>
              <span className="text-center text-sm font-semibold text-m3-primary">{pdfValue}</span>
              <div className="flex items-center justify-center gap-2">
                <span
                  className={`text-sm ${accepted ? "line-through text-m3-on-surface-variant/50" : "text-m3-on-surface"}`}
                >
                  {dbValue}
                </span>
                {accepted && <Check size={14} className="text-m3-success shrink-0" />}
              </div>
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      {!isResolved && (
        <div className="space-y-2">
          {dbMatch.anomalies
            .filter((a) => {
              if (a === "AmountMismatch")
                return !contested && !acceptedKeys.has(buildCorrectionKey(a, dbMatch.procedure_id));
              return !acceptedKeys.has(buildCorrectionKey(a, dbMatch.procedure_id));
            })
            .map((anomaly) => {
              if (anomaly === "AmountMismatch") {
                const key = buildCorrectionKey(anomaly, dbMatch.procedure_id);
                return (
                  <div key={anomaly} className="flex gap-2">
                    <Button
                      variant="primary"
                      fullWidth
                      onClick={() =>
                        onAcceptCorrection(key, buildAutoCorrection(anomaly, pdfLine, dbMatch))
                      }
                    >
                      {t("results.action.correctAmount", { amount: formatAmount(pdfLine.amount) })}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        onAcceptCorrection(
                          contestKey,
                          buildContestCorrection(dbMatch.procedure_id, pdfLine.amount),
                        )
                      }
                    >
                      {t("results.action.contestAmount", {
                        amount: formatAmount(pdfLine.amount),
                      })}
                    </Button>
                  </div>
                );
              }
              const key = buildCorrectionKey(anomaly, dbMatch.procedure_id);
              const label =
                anomaly === "FundMismatch"
                  ? t("results.action.correctFund")
                  : t("results.action.correctDate");
              return (
                <Button
                  key={anomaly}
                  variant="primary"
                  fullWidth
                  onClick={() =>
                    onAcceptCorrection(key, buildAutoCorrection(anomaly, pdfLine, dbMatch))
                  }
                >
                  {label}
                </Button>
              );
            })}
        </div>
      )}
    </div>
  );
}
