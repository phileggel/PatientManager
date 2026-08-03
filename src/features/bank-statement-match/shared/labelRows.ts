import type { BankStatementCorrection, BankStatementLine } from "@/bindings";

/** One label-association row (BAS-120A), derived from the draft's lines. */
export interface LabelRow {
  label: string;
  /** Number of credit lines carrying this label. */
  count: number;
  /** Σ of those lines' amounts (thousandths of a euro). */
  totalAmount: number;
  /** Resolved fund once linked; null while undecided or rejected. */
  fundId: string | null;
  /** True when the label is marked not-a-fund-payment (BAS-030). */
  isRejected: boolean;
  suggestedFundId: string | null;
  suggestedFundName: string | null;
  /** BAS-120E — any of the label's lines carries assigned settlement items. */
  hasAssignedItems: boolean;
}

/**
 * BAS-120 — one row per distinct label, ordered by first occurrence in the
 * statement. Pure grouping over the draft's lines; the engine's link-fund
 * cascade (BAS-066) guarantees every line of a label shares the same
 * fund/rejection state.
 */
export function deriveLabelRows(lines: BankStatementLine[]): LabelRow[] {
  const rows: LabelRow[] = [];
  const byLabel = new Map<string, LabelRow>();
  for (const line of lines) {
    const label = line.credit_line.label;
    let row = byLabel.get(label);
    if (!row) {
      row = {
        label,
        count: 0,
        totalAmount: 0,
        fundId: null,
        isRejected: false,
        suggestedFundId: null,
        suggestedFundName: null,
        hasAssignedItems: false,
      };
      byLabel.set(label, row);
      rows.push(row);
    }
    row.count += 1;
    row.totalAmount += line.credit_line.amount;
    row.fundId = line.fund_id ?? row.fundId;
    if (line.status === "Rejected") row.isRejected = true;
    row.suggestedFundId ??= line.suggested_fund_id;
    row.suggestedFundName ??= line.suggested_fund_name;
    if (line.assigned_group_ids.length > 0 || line.assigned_procedure_ids.length > 0) {
      row.hasAssignedItems = true;
    }
  }
  return rows;
}

/** BAS-121 — the « Continuer » gate: every label linked or ignored. */
export function allLabelsDecided(rows: LabelRow[]): boolean {
  return rows.every((row) => row.fundId !== null || row.isRejected);
}

/**
 * BAS-120C — the in-session correction a « Rétablir » click reverts: the LAST
 * LinkFund correction targeting the label, or null when the label's state
 * comes from a saved mapping (nothing to revert).
 */
export function lastLinkFundCorrectionIndex(
  corrections: BankStatementCorrection[],
  label: string,
): number | null {
  for (let i = corrections.length - 1; i >= 0; i--) {
    const correction = corrections[i];
    if (correction?.type === "LinkFund" && correction.bank_label === label) {
      return i;
    }
  }
  return null;
}
