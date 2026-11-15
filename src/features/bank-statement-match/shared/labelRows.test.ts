/**
 * Unit tests for labelRows.ts (BAS-120/121) — pure derivation of the
 * label-association screen's rows from the reconciliation draft. Per-project
 * rule: data transforms (grouping, aggregation) stay in a colocated `.ts`
 * file, not inline in the `.tsx` screen component.
 *
 * `deriveLabelRows` groups the reconciliation's lines by `credit_line.label`,
 * ordered by first occurrence (BAS-120).
 */
import { describe, expect, it } from "vitest";
import type { BankStatementLine } from "@/bindings";
import { deriveLabelRows } from "./labelRows";

function makeLine(overrides: Partial<BankStatementLine> = {}): BankStatementLine {
  return {
    line_id: "line-1",
    credit_line: { date: "2026-04-10", label: "CPAM75", amount: 150000 },
    status: "NeedsLink",
    fund_id: null,
    assigned_group_ids: [],
    assigned_procedure_ids: [],
    covered_amount: 0,
    remainder_acknowledged: false,
    candidate_groups: [],
    candidate_procedures: [],
    suggested_fund_id: null,
    suggested_fund_name: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// deriveLabelRows — BAS-120/120A
// ---------------------------------------------------------------------------

describe("deriveLabelRows — BAS-120", () => {
  it("produces one row per distinct label, ordered by first occurrence (not alphabetical)", () => {
    const lines = [
      makeLine({ line_id: "l1", credit_line: { date: "2026-04-10", label: "MGEN", amount: 1000 } }),
      makeLine({
        line_id: "l2",
        credit_line: { date: "2026-04-11", label: "CPAM75", amount: 2000 },
      }),
      makeLine({ line_id: "l3", credit_line: { date: "2026-04-12", label: "MGEN", amount: 500 } }),
    ];

    const rows = deriveLabelRows(lines);

    expect(rows.map((r) => r.label)).toEqual(["MGEN", "CPAM75"]);
  });

  it("counts the lines and sums the amount per label", () => {
    const lines = [
      makeLine({ line_id: "l1", credit_line: { date: "2026-04-10", label: "MGEN", amount: 1000 } }),
      makeLine({ line_id: "l2", credit_line: { date: "2026-04-11", label: "MGEN", amount: 500 } }),
    ];

    const rows = deriveLabelRows(lines);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: "MGEN", count: 2, totalAmount: 1500 });
  });

  it("carries the resolved fund id for a linked label", () => {
    const lines = [
      makeLine({
        line_id: "l1",
        status: "Matched",
        fund_id: "fund-1",
        credit_line: { date: "2026-04-10", label: "CPAM75", amount: 1000 },
      }),
    ];

    const rows = deriveLabelRows(lines);

    expect(rows[0]?.fundId).toBe("fund-1");
    expect(rows[0]?.isRejected).toBe(false);
  });

  it("flags a rejected label", () => {
    const lines = [
      makeLine({
        line_id: "l1",
        status: "Rejected",
        fund_id: null,
        credit_line: { date: "2026-04-10", label: "SALAIRE", amount: 1000 },
      }),
    ];

    const rows = deriveLabelRows(lines);

    expect(rows[0]?.isRejected).toBe(true);
    expect(rows[0]?.fundId).toBeNull();
  });

  it("carries the heuristic suggestion for an unknown label (never as fundId, BAS-033)", () => {
    const lines = [
      makeLine({
        line_id: "l1",
        credit_line: { date: "2026-04-10", label: "MUTGEN", amount: 1000 },
        suggested_fund_id: "fund-2",
        suggested_fund_name: "Mutuelle Générale",
      }),
    ];

    const rows = deriveLabelRows(lines);

    expect(rows[0]?.fundId).toBeNull();
    expect(rows[0]?.suggestedFundId).toBe("fund-2");
    expect(rows[0]?.suggestedFundName).toBe("Mutuelle Générale");
  });
});
