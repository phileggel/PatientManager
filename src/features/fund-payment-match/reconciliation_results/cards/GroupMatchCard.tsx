/**
 * GroupMatchCard - Issue card for a PDF line matching multiple procedures.
 *
 * User must distribute the PDF total amount across the matched procedures.
 * Uses AmountField for locale-aware decimal input (fr-FR: comma as separator).
 *
 * Sources: acceptedKeys, autoCorrections (parent correction state), onAcceptCorrection callback.
 */

import { useTranslation } from "react-i18next";
import type { AutoCorrection, DbMatch, NormalizedPdfLine } from "@/bindings";
import { Button } from "@/ui/components/button";
import { AmountField } from "@/ui/components/field";
import {
  buildAutoCorrection,
  buildContestCorrection,
  buildContestKey,
  buildCorrectionKey,
  formatAmount,
} from "../../shared/utils";
import { IssueChip, PdfSummary, ResolvedBadge } from "./CardParts";

interface GroupMatchCardProps {
  pdfLine: NormalizedPdfLine;
  dbMatches: DbMatch[];
  acceptedKeys: Set<string>;
  autoCorrections: Map<string, AutoCorrection>;
  onAcceptCorrection: (key: string, correction: AutoCorrection) => void;
}

export function GroupMatchCard({
  pdfLine,
  dbMatches,
  acceptedKeys,
  autoCorrections,
  onAcceptCorrection,
}: GroupMatchCardProps) {
  const { t } = useTranslation("fund-payment-match");

  const getAmount = (m: DbMatch): number => {
    const key = buildCorrectionKey("AmountMismatch", m.procedure_id);
    const corr = autoCorrections.get(key);
    return corr && "AmountMismatch" in corr ? corr.AmountMismatch.pdf_amount : m.amount || 0;
  };

  const allContested = dbMatches.every((m) => acceptedKeys.has(buildContestKey(m.procedure_id)));

  const currentTotal = dbMatches.reduce((sum, m) => sum + getAmount(m), 0);
  const amountOk = pdfLine.amount === currentTotal;
  const allAnomaliesAccepted = dbMatches.every((m) =>
    m.anomalies.every((a) => {
      if (a === "AmountMismatch")
        return (
          acceptedKeys.has(buildCorrectionKey(a, m.procedure_id)) ||
          acceptedKeys.has(buildContestKey(m.procedure_id))
        );
      return acceptedKeys.has(buildCorrectionKey(a, m.procedure_id));
    }),
  );
  const isResolved = (amountOk || allContested) && allAnomaliesAccepted;
  const diff = pdfLine.amount - currentTotal;

  return (
    <div className="m3-card-elevated space-y-4">
      <div className="flex items-start justify-between gap-3">
        <IssueChip label={t("results.issueType.groupMatch")} variant="warning" />
        {isResolved && <ResolvedBadge label={t("results.resolved.label")} />}
      </div>

      <PdfSummary line={pdfLine} />

      {/* Distribution inputs */}
      <div className="space-y-2">
        {dbMatches.map((m) => (
          <div
            key={m.procedure_id}
            className="flex items-center gap-3 bg-m3-surface-container-low rounded-lg px-3 py-2.5"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-m3-on-surface truncate">{m.procedure_date}</p>
            </div>
            <div className="w-36 shrink-0">
              <AmountField
                id={`amount-${m.procedure_id}`}
                label=""
                value={getAmount(m) / 1000}
                onChange={(val) => {
                  if (val !== null) {
                    onAcceptCorrection(
                      buildCorrectionKey("AmountMismatch", m.procedure_id),
                      buildAutoCorrection("AmountMismatch", pdfLine, m, Math.round(val * 1000)),
                    );
                  }
                }}
              />
            </div>
            <span className="text-sm text-m3-on-surface-variant shrink-0">€</span>
          </div>
        ))}
      </div>

      {/* Total row */}
      <div className="flex items-center justify-between px-1 text-sm">
        <span className="text-m3-on-surface-variant">
          {t("results.distribution.total")} ·{" "}
          <span className="text-xs">
            {t("results.distribution.expected")} {formatAmount(pdfLine.amount)} €
          </span>
        </span>
        <span className={`font-semibold ${amountOk ? "text-m3-success" : "text-m3-error"}`}>
          {formatAmount(currentTotal)} €
          {!amountOk && (
            <span className="text-xs ml-1 font-normal">
              ({t("results.distribution.remaining", { diff: formatAmount(Math.abs(diff)) })})
            </span>
          )}
        </span>
      </div>

      {!isResolved && amountOk && (
        <Button
          variant="primary"
          fullWidth
          onClick={() => {
            for (const m of dbMatches) {
              const key = buildCorrectionKey("AmountMismatch", m.procedure_id);
              if (!acceptedKeys.has(key)) {
                onAcceptCorrection(
                  key,
                  buildAutoCorrection("AmountMismatch", pdfLine, m, getAmount(m)),
                );
              }
            }
          }}
        >
          {t("results.action.validateDistribution")}
        </Button>
      )}
      {!isResolved && !amountOk && !allContested && currentTotal > 0 && (
        <Button
          variant="secondary"
          fullWidth
          onClick={() => {
            for (const m of dbMatches) {
              if (!acceptedKeys.has(buildContestKey(m.procedure_id))) {
                onAcceptCorrection(
                  buildContestKey(m.procedure_id),
                  buildContestCorrection(m.procedure_id, getAmount(m)),
                );
              }
            }
          }}
        >
          {t("results.action.contestAmount", { amount: formatAmount(currentTotal) })}
        </Button>
      )}
    </div>
  );
}
