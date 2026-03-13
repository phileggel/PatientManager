/**
 * TooManyCard - Issue card for PDF lines with too many matching candidates.
 *
 * Informational only — no user action possible in this modal.
 * Blocks the entire reconciliation validation until resolved manually.
 *
 * Sources: static props only, no correction state needed.
 */

import { useTranslation } from "react-i18next";
import type { NormalizedPdfLine } from "@/bindings";
import { IssueChip, PdfSummary } from "./CardParts";

interface TooManyCardProps {
  pdfLine: NormalizedPdfLine;
  count: number;
}

export function TooManyCard({ pdfLine, count }: TooManyCardProps) {
  const { t } = useTranslation("fund-payment-match");
  return (
    <div className="m3-card-elevated space-y-4">
      <IssueChip label={t("results.issueType.tooMany")} variant="blocked" />
      <PdfSummary line={pdfLine} />
      <div className="rounded-lg bg-m3-error-container/30 border border-m3-error/20 px-4 py-3 space-y-1">
        <p className="text-sm font-medium text-m3-on-error-container">
          {t("results.tooMany.description", { count })}
        </p>
        <p className="text-xs text-m3-on-surface-variant">{t("results.tooMany.hint")}</p>
      </div>
    </div>
  );
}
