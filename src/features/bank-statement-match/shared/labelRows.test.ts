/**
 * Unit tests for labelRows.ts (BAS-120/121) — pure derivation of the
 * label-association screen's rows from the reconciliation draft. Per-project
 * rule: data transforms (grouping, aggregation) stay in a colocated `.ts`
 * file, not inline in the `.tsx` screen component.
 *
 * `deriveLabelRows` groups the reconciliation's lines by `credit_line.label`,
 * ordered by first occurrence (BAS-120); `allLabelsDecided` implements the
 * BAS-121 gate; `lastLinkFundCorrectionIndex` locates the in-session
 * correction a "Rétablir" click should revert (BAS-120C).
 *
 * These tests fail until shared/labelRows.ts is created.
 */
import { describe, expect, it } from "vitest";
import type { BankStatementCorrection, BankStatementLine } from "@/bindings";
import { allLabelsDecided, deriveLabelRows, lastLinkFundCorrectionIndex } from "./labelRows";

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
    broadened_candidates: [],
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
      makeLine({ line_id: "l2", credit_line: { date: "2026-04-11", label: "CPAM75", amount: 2000 } }),
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

  it("flags hasAssignedItems when any line of the label carries assigned groups", () => {
    const lines = [
      makeLine({
        line_id: "l1",
        status: "Matched",
        fund_id: "fund-1",
        assigned_group_ids: ["group-1"],
        credit_line: { date: "2026-04-10", label: "CPAM75", amount: 1000 },
      }),
      makeLine({
        line_id: "l2",
        status: "NeedsGroup",
        fund_id: "fund-1",
        credit_line: { date: "2026-04-11", label: "CPAM75", amount: 500 },
      }),
    ];

    const rows = deriveLabelRows(lines);

    expect(rows[0]?.hasAssignedItems).toBe(true);
  });

  it("flags hasAssignedItems when any line of the label carries assigned procedures", () => {
    const lines = [
      makeLine({
        line_id: "l1",
        status: "Partial",
        fund_id: "fund-1",
        assigned_procedure_ids: ["proc-1"],
        credit_line: { date: "2026-04-10", label: "RATP", amount: 1000 },
      }),
    ];

    const rows = deriveLabelRows(lines);

    expect(rows[0]?.hasAssignedItems).toBe(true);
  });

  it("does not flag hasAssignedItems when no line of the label carries settlement items", () => {
    const lines = [
      makeLine({
        line_id: "l1",
        status: "NeedsGroup",
        fund_id: "fund-1",
        credit_line: { date: "2026-04-10", label: "CPAM75", amount: 1000 },
      }),
    ];

    const rows = deriveLabelRows(lines);

    expect(rows[0]?.hasAssignedItems).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// allLabelsDecided — BAS-121 gate
// ---------------------------------------------------------------------------

describe("allLabelsDecided — BAS-121", () => {
  it("is false when at least one label is neither linked nor ignored", () => {
    const lines = [
      makeLine({ line_id: "l1", status: "Matched", fund_id: "fund-1" }),
      makeLine({
        line_id: "l2",
        status: "NeedsLink",
        fund_id: null,
        credit_line: { date: "2026-04-11", label: "MGEN", amount: 500 },
      }),
    ];

    expect(allLabelsDecided(deriveLabelRows(lines))).toBe(false);
  });

  it("is true when every label is linked or ignored", () => {
    const lines = [
      makeLine({ line_id: "l1", status: "Matched", fund_id: "fund-1" }),
      makeLine({
        line_id: "l2",
        status: "Rejected",
        fund_id: null,
        credit_line: { date: "2026-04-11", label: "MGEN", amount: 500 },
      }),
    ];

    expect(allLabelsDecided(deriveLabelRows(lines))).toBe(true);
  });

  it("is vacuously true for zero labels", () => {
    expect(allLabelsDecided(deriveLabelRows([]))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// lastLinkFundCorrectionIndex — BAS-120C Rétablir target
// ---------------------------------------------------------------------------

describe("lastLinkFundCorrectionIndex — BAS-120C", () => {
  it("returns null when no correction targets the label (saved mapping/rejection)", () => {
    const corrections: BankStatementCorrection[] = [
      { type: "LinkFund", bank_label: "CPAM75", assignment: { type: "Rejected" } },
    ];

    expect(lastLinkFundCorrectionIndex(corrections, "MGEN")).toBeNull();
  });

  it("returns the index of the matching LinkFund correction", () => {
    const corrections: BankStatementCorrection[] = [
      { type: "AssignGroups", line_id: "line-1", group_ids: [] },
      { type: "LinkFund", bank_label: "MGEN", assignment: { type: "Rejected" } },
    ];

    expect(lastLinkFundCorrectionIndex(corrections, "MGEN")).toBe(1);
  });

  it("returns the LAST matching index when the label was re-linked more than once", () => {
    const corrections: BankStatementCorrection[] = [
      { type: "LinkFund", bank_label: "MGEN", assignment: { type: "Fund", fund_id: "fund-1" } },
      { type: "LinkFund", bank_label: "MGEN", assignment: { type: "Rejected" } },
    ];

    expect(lastLinkFundCorrectionIndex(corrections, "MGEN")).toBe(1);
  });
});
