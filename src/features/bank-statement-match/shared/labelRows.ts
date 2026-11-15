import type { BankStatementLine } from "@/bindings";

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
  }
  return rows;
}

/**
 * F25 — DOM-id-safe slug of a raw bank label: HTML ids must not contain
 * whitespace, and real labels do (`SALAIRE KINE REMPL`). Whitespace runs
 * collapse to `_`; everything else passes through (non-ASCII is id-legal).
 */
export function labelSlug(label: string): string {
  return label.replace(/\s+/g, "_");
}
