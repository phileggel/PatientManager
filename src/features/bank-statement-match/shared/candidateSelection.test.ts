/**
 * Unit tests for shared/candidateSelection.ts::coveredAmount (BAS-091/113).
 *
 * `coveredAmount` sums selected candidate amounts against a line. Historically
 * groups-only (Σ selected candidate_groups/broadened_candidates total_amount);
 * BAS-113 makes it settlement-item-aware — when the procedure scope selection
 * is active it must instead sum candidate_procedures billed_amount for the
 * selected procedure ids (BAS-091/113 balance semantics reused verbatim).
 *
 * Pure function — no mocks, no React.
 *
 * These procedure-scope cases fail until candidateSelection.ts is updated;
 * the groups-only cases exercise the pre-existing (unchanged) behavior.
 */
import { describe, expect, it } from "vitest";
import type { BankStatementLine } from "@/bindings";
import { coveredAmount } from "./candidateSelection";

function makeLine(overrides: Partial<BankStatementLine> = {}): BankStatementLine {
  return {
    line_id: "line-1",
    credit_line: { date: "2026-04-10", label: "CPAM75", amount: 150000 },
    status: "NeedsGroup",
    fund_id: "fund-1",
    assigned_group_ids: [],
    assigned_procedure_ids: [],
    covered_amount: 0,
    remainder_acknowledged: false,
    candidate_groups: [
      {
        group_id: "group-1",
        fund_id: "fund-1",
        fund_name: "CPAM Paris",
        payment_date: "2026-04-08",
        total_amount: 100000,
        is_exact_amount: false,
      },
    ],
    broadened_candidates: [],
    candidate_procedures: [
      {
        procedure_id: "proc-1",
        patient_name: "Jean Dupont",
        procedure_date: "2026-03-01",
        billed_amount: 60000,
        is_exact_amount: false,
      },
      {
        procedure_id: "proc-2",
        patient_name: "Marie Curie",
        procedure_date: "2026-03-05",
        billed_amount: 90000,
        is_exact_amount: false,
      },
    ],
    suggested_fund_id: null,
    suggested_fund_name: null,
    ...overrides,
  };
}

describe("coveredAmount — groups (pre-existing BAS-091 behavior)", () => {
  it("sums total_amount for selected group ids (groups is the default kind)", () => {
    const line = makeLine();
    expect(coveredAmount(line, ["group-1"])).toBe(100000);
  });

  it("returns 0 for an empty selection", () => {
    const line = makeLine();
    expect(coveredAmount(line, [])).toBe(0);
  });
});

describe("coveredAmount — procedures (BAS-113 settlement-item-aware)", () => {
  it("sums billed_amount for selected procedure ids when the procedure scope is active", () => {
    const line = makeLine();
    expect(coveredAmount(line, ["proc-1", "proc-2"], "procedures")).toBe(150000);
  });

  it("sums only the selected procedure ids, ignoring unselected candidates", () => {
    const line = makeLine();
    expect(coveredAmount(line, ["proc-1"], "procedures")).toBe(60000);
  });

  it("returns 0 for an empty procedure selection", () => {
    const line = makeLine();
    expect(coveredAmount(line, [], "procedures")).toBe(0);
  });

  it("never mixes group and procedure amounts across kinds", () => {
    const line = makeLine();
    // A procedure id happens to be selected while kind="groups" — must not
    // accidentally match against candidate_procedures.
    expect(coveredAmount(line, ["proc-1"])).toBe(0);
  });
});
