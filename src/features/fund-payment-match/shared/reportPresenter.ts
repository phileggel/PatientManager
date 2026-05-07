import type {
  AutoCorrection,
  CorrectionGroup,
  Fund,
  ReconciliationMatch,
  UnreconciledProcedure,
  UnreconciledRow,
  UnreconciledSection,
} from "@/bindings";
import { formatCurrency, formatShortDate } from "./formatters";

// ────────────────────────────────────────────────────────────────────────────
// FE-side report presenter (FPR-031 to FPR-042, ADR-006)
//
// Builds the `unreconciled` (Section 1) and `correction_groups` (Section 2)
// fields carried in `ReportGenerationRequest`. The backend renders rows as
// opaque strings — every per-variant column layout, currency value, and date
// string is resolved here on the frontend.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build the `fund_id` → display-label lookup used by FundMismatch row
 * rendering. Pure transform from the funds collection held in the global
 * store; isolated here so consumers don't reimplement it inline.
 */
export function buildFundIdToLabel(funds: readonly Fund[]): Map<string, string> {
  return new Map(funds.map((f) => [f.id, f.name]));
}

export interface CorrectionGroupsInput {
  autoCorrections: Map<string, AutoCorrection>;
  matches: ReconciliationMatch[];
  fundIdToLabel: Map<string, string>;
  locale: string;
  t: (key: string) => string;
}

type CorrectionType =
  | "ContestAmount"
  | "CreateProcedure"
  | "LinkProcedure"
  | "AmountMismatch"
  | "FundMismatch"
  | "DateMismatch";

// FPR-041 — group display priority order
const PRIORITY_ORDER: readonly CorrectionType[] = [
  "ContestAmount",
  "CreateProcedure",
  "LinkProcedure",
  "AmountMismatch",
  "FundMismatch",
  "DateMismatch",
] as const;

interface RowEntry {
  sortKey: string;
  text: string;
}

function findMatchData(
  matches: ReconciliationMatch[],
  procedureId: string,
): { pdfPatient: string; dbDate: string; dbAmount: number | null; dbFundId: string | null } | null {
  for (const match of matches) {
    if (
      (match.type === "SingleMatchIssue" || match.type === "PerfectSingleMatch") &&
      match.data.db_match.procedure_id === procedureId
    ) {
      return {
        pdfPatient: match.data.pdf_line.patient_name,
        dbDate: match.data.db_match.procedure_date,
        dbAmount: match.data.db_match.amount,
        dbFundId: match.data.db_match.fund_id,
      };
    }
    if (match.type === "GroupMatchIssue" || match.type === "PerfectGroupMatch") {
      const dbMatch = match.data.db_matches.find((m) => m.procedure_id === procedureId);
      if (dbMatch) {
        return {
          pdfPatient: match.data.pdf_line.patient_name,
          dbDate: dbMatch.procedure_date,
          dbAmount: dbMatch.amount,
          dbFundId: dbMatch.fund_id,
        };
      }
    }
  }
  return null;
}

function fundLabel(fundId: string | null, fundIdToLabel: Map<string, string>): string {
  if (!fundId) return "";
  return fundIdToLabel.get(fundId) ?? fundId;
}

/**
 * Build the per-type row entry for a single correction.
 * Returns null if the correction does not belong to this group.
 */
function rowFor(
  type: CorrectionType,
  correction: AutoCorrection,
  input: CorrectionGroupsInput,
): RowEntry | null {
  const { matches, fundIdToLabel, locale } = input;

  if (type === "ContestAmount" && "ContestAmount" in correction) {
    const { procedure_id, paid_amount } = correction.ContestAmount;
    const m = findMatchData(matches, procedure_id);
    const patient = m?.pdfPatient ?? "";
    const date = m?.dbDate ?? "";
    const billed = m?.dbAmount ?? 0;
    return {
      sortKey: date,
      text: `${patient} | ${formatShortDate(date, locale)} | ${formatCurrency(billed, locale)} → ${formatCurrency(paid_amount, locale)}`,
    };
  }

  if (type === "CreateProcedure" && "CreateProcedure" in correction) {
    const c = correction.CreateProcedure;
    return {
      sortKey: c.procedure_date,
      text: `${c.patient_name} | ${c.ssn} | ${formatShortDate(c.procedure_date, locale)} | ${c.pdf_fund_label} | ${formatCurrency(c.billed_amount, locale)}`,
    };
  }

  if (type === "LinkProcedure" && "LinkProcedure" in correction) {
    const { procedure_id, pdf_ssn, pdf_fund_label, payment_date } = correction.LinkProcedure;
    const m = findMatchData(matches, procedure_id);
    const patient = m?.pdfPatient ?? "";
    return {
      sortKey: payment_date,
      text: `${patient} | ${pdf_ssn} | ${pdf_fund_label} | ${formatShortDate(payment_date, locale)}`,
    };
  }

  if (type === "AmountMismatch" && "AmountMismatch" in correction) {
    const { procedure_id, pdf_amount } = correction.AmountMismatch;
    const m = findMatchData(matches, procedure_id);
    const patient = m?.pdfPatient ?? "";
    const date = m?.dbDate ?? "";
    const original = m?.dbAmount ?? 0;
    return {
      sortKey: date,
      text: `${patient} | ${formatShortDate(date, locale)} | ${formatCurrency(original, locale)} → ${formatCurrency(pdf_amount, locale)}`,
    };
  }

  if (type === "FundMismatch" && "FundMismatch" in correction) {
    const { procedure_id, pdf_fund_label } = correction.FundMismatch;
    const m = findMatchData(matches, procedure_id);
    const patient = m?.pdfPatient ?? "";
    const date = m?.dbDate ?? "";
    const original = fundLabel(m?.dbFundId ?? null, fundIdToLabel);
    return {
      sortKey: date,
      text: `${patient} | ${formatShortDate(date, locale)} | ${original} → ${pdf_fund_label}`,
    };
  }

  if (type === "DateMismatch" && "DateMismatch" in correction) {
    const { procedure_id, pdf_date } = correction.DateMismatch;
    const m = findMatchData(matches, procedure_id);
    const patient = m?.pdfPatient ?? "";
    const original = m?.dbDate ?? "";
    return {
      sortKey: original,
      text: `${patient} | ${formatShortDate(original, locale)} → ${formatShortDate(pdf_date, locale)}`,
    };
  }

  return null;
}

/**
 * Build the Section 2 correction groups for `ReportGenerationRequest`.
 *
 * - Groups are emitted in FPR-041 priority order (ContestAmount first,
 *   DateMismatch last).
 * - Empty groups are omitted entirely.
 * - Within each group, rows are sorted by date ascending.
 * - Each row is a pre-joined string ready to render.
 */
export function buildCorrectionGroups(input: CorrectionGroupsInput): CorrectionGroup[] {
  const buckets: Record<CorrectionType, RowEntry[]> = {
    ContestAmount: [],
    CreateProcedure: [],
    LinkProcedure: [],
    AmountMismatch: [],
    FundMismatch: [],
    DateMismatch: [],
  };

  for (const correction of input.autoCorrections.values()) {
    for (const type of PRIORITY_ORDER) {
      const row = rowFor(type, correction, input);
      if (row) {
        buckets[type].push(row);
        break;
      }
    }
  }

  const groups: CorrectionGroup[] = [];
  for (const type of PRIORITY_ORDER) {
    const entries = buckets[type];
    if (entries.length === 0) continue;
    entries.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    groups.push({
      title: input.t(`print.section2.groups.${type}`),
      rows: entries.map((e) => e.text),
    });
  }
  return groups;
}

// ────────────────────────────────────────────────────────────────────────────
// Section 1 — unreconciled procedures (FPR-031, FPR-032, FPR-033)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build the `unreconciled` field of `ReportGenerationRequest`.
 *
 * - `Empty` variant when `rows` is empty (FPR-032).
 * - `Rows` variant otherwise: each cell is pre-formatted (date, currency)
 *   and the total is summed and formatted on the FE (FPR-033).
 */
export function buildUnreconciledSection(
  rows: UnreconciledProcedure[],
  locale: string,
  t: (k: string) => string,
): UnreconciledSection {
  const heading = t("print.section1.heading");
  if (rows.length === 0) {
    return {
      type: "Empty",
      data: {
        heading,
        empty_message: t("print.section1.empty"),
      },
    };
  }

  const formattedRows: UnreconciledRow[] = rows.map((p) => ({
    date: formatShortDate(p.procedure_date, locale),
    patient: p.patient_name,
    ssn: p.ssn,
    amount: formatCurrency(p.amount, locale),
  }));
  const totalThousandths = rows.reduce((sum, r) => sum + r.amount, 0);

  return {
    type: "Rows",
    data: {
      heading,
      column_headers: {
        date: t("print.columns.date"),
        patient: t("print.columns.patient"),
        ssn: t("print.columns.ssn"),
        amount: t("print.columns.billed"),
      },
      rows: formattedRows,
      total_label: t("print.section1.total"),
      total_value: formatCurrency(totalThousandths, locale),
    },
  };
}
