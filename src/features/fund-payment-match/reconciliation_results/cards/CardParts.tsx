/**
 * Shared rendering primitives used across all reconciliation issue cards.
 * PdfSummary, IssueChip, ResolvedBadge.
 */

import { AlertTriangle, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { NormalizedPdfLine } from "@/bindings";
import { formatAmount, formatProcedureDateFromLine } from "../../shared/utils";

// ─── PDF summary row ──────────────────────────────────────────────────────────

export function PdfSummary({ line }: { line: NormalizedPdfLine }) {
  const { t } = useTranslation("fund-payment-match");
  return (
    <div className="rounded-lg bg-m3-surface-container-low px-4 py-3 space-y-1">
      <p className="text-[11px] font-semibold text-m3-primary uppercase tracking-wide">
        {t("results.pdf.label")}
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-m3-on-surface">
        <span>
          <span className="text-m3-on-surface-variant text-xs">{t("results.pdf.patient")} </span>
          <span className="font-medium">{line.patient_name}</span>
        </span>
        <span>
          <span className="text-m3-on-surface-variant text-xs">{t("results.pdf.ssn")} </span>
          <span className="font-medium">{line.ssn}</span>
        </span>
        <span>
          <span className="text-m3-on-surface-variant text-xs">{t("results.pdf.date")} </span>
          <span className="font-medium">{formatProcedureDateFromLine(line)}</span>
        </span>
        <span>
          <span className="text-m3-on-surface-variant text-xs">{t("results.pdf.amount")} </span>
          <span className="font-semibold text-m3-primary">{formatAmount(line.amount)} €</span>
        </span>
        <span>
          <span className="text-m3-on-surface-variant text-xs">{t("results.pdf.fund")} </span>
          <span className="font-medium">{line.fund_name}</span>
        </span>
      </div>
    </div>
  );
}

// ─── Issue type chip ──────────────────────────────────────────────────────────

export function IssueChip({
  label,
  variant,
}: {
  label: string;
  variant: "error" | "warning" | "blocked";
}) {
  const colorMap = {
    error: "bg-m3-error-container text-m3-on-error-container",
    warning: "bg-m3-warning-container text-m3-on-warning-container",
    blocked: "bg-m3-error-container text-m3-on-error-container opacity-80",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${colorMap[variant]}`}
    >
      <AlertTriangle size={11} />
      {label}
    </span>
  );
}

// ─── Resolved badge ───────────────────────────────────────────────────────────

export function ResolvedBadge({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-sm font-medium text-m3-on-success-container bg-m3-success-container px-3 py-1.5 rounded-full w-fit">
      <Check size={14} />
      {label}
    </div>
  );
}
