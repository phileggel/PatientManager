/**
 * GroupMatchCard - Issue card for a PDF line matching multiple procedures.
 *
 * User must distribute the PDF total amount across the matched procedures.
 * Uses AmountField for locale-aware decimal input (fr-FR: comma as separator).
 *
 * A procedure whose typed amount is below its billed amount asks the user to correct or to
 * dispute it (FPA-141, FPA-141A). Until the choice, the typed amount is held as an amount
 * correction staged but not accepted; correcting accepts it, disputing replaces it with a dispute
 * whose paid amount is the typed amount, the billed amount being kept.
 *
 * Sources: acceptedKeys, autoCorrections (parent correction state), onAcceptCorrection,
 * onStageCorrection and onUnacceptCorrection callbacks.
 */

import { useTranslation } from "react-i18next";
import type { AutoCorrection, DbMatch, NormalizedPdfLine } from "@/bindings";
import { Button } from "@/ui/components/button";
import { AmountField } from "@/ui/components/field";
import { useFormatters } from "@/ui/format/formatters";
import {
  buildAutoCorrection,
  buildCorrectionKey,
  buildDisputeCorrection,
  buildDisputeKey,
} from "../../shared/utils";
import { IssueChip, PdfSummary, ResolvedBadge } from "./CardParts";

interface GroupMatchCardProps {
  pdfLine: NormalizedPdfLine;
  dbMatches: DbMatch[];
  acceptedKeys: Set<string>;
  autoCorrections: Map<string, AutoCorrection>;
  onAcceptCorrection: (key: string, correction: AutoCorrection) => void;
  onStageCorrection: (key: string, correction: AutoCorrection) => void;
  onUnacceptCorrection: (keys: string[]) => void;
}

export function GroupMatchCard({
  pdfLine,
  dbMatches,
  acceptedKeys,
  autoCorrections,
  onAcceptCorrection,
  onStageCorrection,
  onUnacceptCorrection,
}: GroupMatchCardProps) {
  const { t } = useTranslation("fund-payment-match");
  const { formatCurrency, formatDate } = useFormatters();

  const amountKey = (m: DbMatch) => buildCorrectionKey("AmountMismatch", m.procedure_id);
  const billed = (m: DbMatch) => m.amount || 0;
  const isDisputed = (m: DbMatch) => acceptedKeys.has(buildDisputeKey(m.procedure_id));

  // FPA-141D: a disputed procedure counts with its paid amount.
  const getAmount = (m: DbMatch): number => {
    const dispute = autoCorrections.get(buildDisputeKey(m.procedure_id));
    if (dispute && "DisputeAmount" in dispute) return dispute.DisputeAmount.paid_amount;
    const corr = autoCorrections.get(amountKey(m));
    return corr && "AmountMismatch" in corr ? corr.AmountMismatch.pdf_amount : billed(m);
  };

  const paidLess = (m: DbMatch) => getAmount(m) < billed(m);
  const isCorrected = (m: DbMatch) => paidLess(m) && acceptedKeys.has(amountKey(m));
  const hasChoice = (m: DbMatch) => isDisputed(m) || isCorrected(m);

  // FPA-141B: below the billed amount the choice is kept; at or above it the amount is corrected.
  const setAmount = (m: DbMatch, amount: number) => {
    const correction = buildAutoCorrection("AmountMismatch", pdfLine, m, amount);
    if (amount >= billed(m)) {
      if (isDisputed(m)) onUnacceptCorrection([buildDisputeKey(m.procedure_id)]);
      onAcceptCorrection(amountKey(m), correction);
    } else if (isDisputed(m)) {
      onAcceptCorrection(
        buildDisputeKey(m.procedure_id),
        buildDisputeCorrection(m.procedure_id, amount),
      );
    } else if (isCorrected(m)) {
      onAcceptCorrection(amountKey(m), correction);
    } else {
      onStageCorrection(amountKey(m), correction);
    }
  };

  // FPA-141A: correcting accepts the typed amount; disputing records it as paid instead.
  const correct = (m: DbMatch) => {
    const amount = getAmount(m);
    if (isDisputed(m)) onUnacceptCorrection([buildDisputeKey(m.procedure_id)]);
    onAcceptCorrection(amountKey(m), buildAutoCorrection("AmountMismatch", pdfLine, m, amount));
  };
  const dispute = (m: DbMatch) => {
    const amount = getAmount(m);
    onUnacceptCorrection([amountKey(m)]);
    onAcceptCorrection(
      buildDisputeKey(m.procedure_id),
      buildDisputeCorrection(m.procedure_id, amount),
    );
  };

  const currentTotal = dbMatches.reduce((sum, m) => sum + getAmount(m), 0);
  const amountOk = pdfLine.amount === currentTotal;
  const allAnomaliesAccepted = dbMatches.every((m) =>
    m.anomalies.every((a) => {
      if (a === "AmountMismatch") return acceptedKeys.has(amountKey(m)) || isDisputed(m);
      return acceptedKeys.has(buildCorrectionKey(a, m.procedure_id));
    }),
  );
  const isResolved = amountOk && allAnomaliesAccepted;
  const diff = pdfLine.amount - currentTotal;
  // FPA-141C: the distribution can be validated once it adds up and every choice is made.
  const canValidate = amountOk && dbMatches.every((m) => !paidLess(m) || hasChoice(m));

  return (
    <div className="m3-card-elevated space-y-4">
      <div className="flex items-start justify-between gap-3">
        <IssueChip label={t("results.issue_type.group_match")} variant="warning" />
        {isResolved && <ResolvedBadge label={t("results.resolved.label")} />}
      </div>

      <PdfSummary line={pdfLine} />

      {/* Distribution inputs */}
      <div className="space-y-2">
        {dbMatches.map((m) => {
          const otherAnomalies = m.anomalies.filter((a) => a !== "AmountMismatch");
          return (
            <div
              key={m.procedure_id}
              className="bg-m3-surface-container-low rounded-lg px-3 py-2.5 space-y-1.5"
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-m3-on-surface truncate">
                    {formatDate(m.procedure_date)}
                  </p>
                </div>
                <span className="text-xs text-m3-on-surface-variant shrink-0">
                  {t("results.distribution.billed", { amount: formatCurrency(billed(m)) })}
                </span>
                <div className="w-36 shrink-0">
                  <AmountField
                    id={`amount-${m.procedure_id}`}
                    label=""
                    value={getAmount(m) / 1000}
                    onChange={(val) => {
                      if (val !== null) setAmount(m, Math.round(val * 1000));
                    }}
                  />
                </div>
                <span className="text-sm text-m3-on-surface-variant shrink-0">€</span>
              </div>
              {(otherAnomalies.length > 0 || paidLess(m)) && (
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0 flex flex-wrap gap-1.5">
                    {otherAnomalies.map((a) => (
                      <span
                        key={a}
                        className="text-xs px-2 py-0.5 rounded-full bg-m3-warning-container text-m3-on-warning-container"
                      >
                        {t(
                          `results.badge.${a === "DateMismatch" ? "date_mismatch" : "fund_mismatch"}`,
                        )}
                      </span>
                    ))}
                  </div>
                  {paidLess(m) && (
                    <>
                      <span
                        className={`text-xs shrink-0 ${hasChoice(m) ? "text-m3-on-surface-variant" : "text-m3-error"}`}
                      >
                        {t("results.distribution.paid_less", {
                          diff: formatCurrency(billed(m) - getAmount(m)),
                        })}
                      </span>
                      <div className="flex items-center gap-1 rounded-xl border border-m3-outline/30 p-1 shrink-0">
                        <Button
                          id={`fund-payment-match-group-correct-${m.procedure_id}`}
                          variant={isCorrected(m) ? "tonal" : "ghost"}
                          size="sm"
                          aria-pressed={isCorrected(m)}
                          onClick={() => correct(m)}
                        >
                          {t("results.action.corrected")}
                        </Button>
                        <Button
                          id={`fund-payment-match-group-dispute-${m.procedure_id}`}
                          variant={isDisputed(m) ? "tonal" : "ghost"}
                          size="sm"
                          aria-pressed={isDisputed(m)}
                          onClick={() => dispute(m)}
                        >
                          {t("results.action.disputed")}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Total row */}
      <div className="flex items-center justify-between px-1 text-sm">
        <span className="text-m3-on-surface-variant">
          {t("results.distribution.total")} ·{" "}
          <span className="text-xs">
            {t("results.distribution.expected")} {formatCurrency(pdfLine.amount)}
          </span>
        </span>
        <span className={`font-semibold ${amountOk ? "text-m3-success" : "text-m3-error"}`}>
          {formatCurrency(currentTotal)}
          {!amountOk && (
            <span className="text-xs ml-1 font-normal">
              ({t("results.distribution.remaining", { diff: formatCurrency(Math.abs(diff)) })})
            </span>
          )}
        </span>
      </div>

      {!isResolved && (
        <Button
          id="fund-payment-match-group-validate"
          variant="primary"
          fullWidth
          disabled={!canValidate}
          onClick={() => {
            for (const m of dbMatches) {
              // FPA-141C: a disputed procedure keeps its billed amount.
              for (const anomaly of [
                ...(isDisputed(m) ? [] : ["AmountMismatch" as const]),
                ...m.anomalies.filter((a) => a !== "AmountMismatch"),
              ]) {
                const key = buildCorrectionKey(anomaly, m.procedure_id);
                if (!acceptedKeys.has(key)) {
                  onAcceptCorrection(key, buildAutoCorrection(anomaly, pdfLine, m, getAmount(m)));
                }
              }
            }
          }}
        >
          {t("results.action.validate_distribution")}
        </Button>
      )}
    </div>
  );
}
