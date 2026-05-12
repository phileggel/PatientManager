/**
 * Shared utilities for the fund-payment-match feature.
 * Key builders, correction factories, formatting helpers, and issue sorting.
 */

import type { TFunction } from "i18next";
import type {
  AutoCorrection,
  DbMatch,
  NormalizedPdfLine,
  NotFoundCandidate,
  PdfParseResult,
  ReconciliationMatch,
} from "@/bindings";
import { formatShortDate } from "@/lib/formatters";

// ─── Key builders ────────────────────────────────────────────────────────────

export function buildCorrectionKey(anomaly: string, procedureId: string): string {
  return `${anomaly}-${procedureId}`;
}

export function buildNotFoundKey(line: NormalizedPdfLine): string {
  return `CreateProcedure-${line.line_index}`;
}

export function buildLinkProcedureKey(procedureId: string): string {
  return `LinkProcedure-${procedureId}`;
}

export function buildContestKey(procedureId: string): string {
  return `ContestAmount-${procedureId}`;
}

// ─── Correction factories ─────────────────────────────────────────────────────

export function buildAutoCorrection(
  anomaly: string,
  pdfLine: NormalizedPdfLine,
  dbMatch: DbMatch,
  customAmount?: number,
): AutoCorrection {
  switch (anomaly) {
    case "AmountMismatch":
      return {
        AmountMismatch: {
          procedure_id: dbMatch.procedure_id,
          pdf_amount: customAmount ?? pdfLine.amount,
        },
      };
    case "FundMismatch":
      return {
        FundMismatch: { procedure_id: dbMatch.procedure_id, pdf_fund_label: pdfLine.fund_name },
      };
    case "DateMismatch":
      return {
        DateMismatch: {
          procedure_id: dbMatch.procedure_id,
          pdf_date: pdfLine.procedure_start_date,
        },
      };
    default:
      throw new Error(`Unknown anomaly type: ${anomaly}`);
  }
}

export function buildLinkProcedureCorrection(
  candidate: NotFoundCandidate,
  pdfLine: NormalizedPdfLine,
): AutoCorrection {
  return {
    LinkProcedure: {
      procedure_id: candidate.procedure_id,
      pdf_ssn: pdfLine.ssn,
      pdf_fund_label: pdfLine.fund_name,
      payment_date: pdfLine.payment_date,
    },
  };
}

export function buildContestCorrection(procedureId: string, paidAmount: number): AutoCorrection {
  return {
    ContestAmount: {
      procedure_id: procedureId,
      paid_amount: paidAmount,
    },
  };
}

export function buildNotFoundCorrection(line: NormalizedPdfLine): AutoCorrection {
  return {
    CreateProcedure: {
      ssn: line.ssn,
      patient_name: line.patient_name,
      procedure_date: line.procedure_start_date,
      payment_date: line.payment_date,
      billed_amount: line.amount,
      pdf_fund_label: line.fund_name,
    },
  };
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Format procedure date for display. Single dates render via the locale-aware
 * short-date helper; period dates render both endpoints localized and joined
 * through the `format.datePeriod` i18n key. */
export function formatProcedureDateFromLine(
  line: NormalizedPdfLine,
  t: TFunction<"fund-payment-match">,
  locale: string,
): string {
  if (line.is_period) {
    return t("format.datePeriod", {
      start: formatShortDate(line.procedure_start_date, locale),
      end: formatShortDate(line.procedure_end_date, locale),
    });
  }
  return formatShortDate(line.procedure_start_date, locale);
}

/** Compute ISO date range (YYYY-MM-DD) from all procedure dates in a PDF parse result */
export function computePdfDateRange(data: PdfParseResult): { start: string; end: string } | null {
  const dates: string[] = [];
  for (const group of data.groups) {
    for (const line of group.lines) {
      dates.push(line.procedure_start_date);
      dates.push(line.procedure_end_date);
    }
  }
  if (dates.length === 0) return null;
  const sorted = dates.filter(Boolean).toSorted();
  return { start: sorted[0] ?? "", end: sorted[sorted.length - 1] ?? "" };
}

// ─── Issue sorting ────────────────────────────────────────────────────────────

function getLineIndex(match: ReconciliationMatch): number {
  return match.data.pdf_line.line_index;
}

/**
 * Sort issues: TooManyMatchIssue first (blocking, must be seen immediately),
 * then all other issues in PDF document order (line_index ascending).
 */
export function sortIssuesByPriority(matches: ReconciliationMatch[]): ReconciliationMatch[] {
  const filtered = [...matches].filter(
    (m) => m.type !== "PerfectSingleMatch" && m.type !== "PerfectGroupMatch",
  );
  const tooMany = filtered
    .filter((m) => m.type === "TooManyMatchIssue")
    .toSorted((a, b) => getLineIndex(a) - getLineIndex(b));
  const others = filtered
    .filter((m) => m.type !== "TooManyMatchIssue")
    .toSorted((a, b) => getLineIndex(a) - getLineIndex(b));
  return [...tooMany, ...others];
}

// ─── Anomaly counting ─────────────────────────────────────────────────────────

/** Count the total number of actionable anomalies (issues requiring user resolution) */
export function countTotalAnomalies(result: { matches: ReconciliationMatch[] }): number {
  let count = 0;
  for (const match of result.matches) {
    if (
      match.type === "SingleMatchIssue" ||
      match.type === "GroupMatchIssue" ||
      match.type === "NotFoundIssue" ||
      match.type === "TooManyMatchIssue"
    ) {
      count += 1;
    }
  }
  return count;
}

// ─── Formatting ───────────────────────────────────────────────────────────────

/** Format a thousandths-of-euro amount as a euros string, e.g. 50000 → "50.00" */
export function formatAmount(thousandths: number): string {
  return (thousandths / 1000).toFixed(2);
}
