/**
 * Unit tests for reconciliationPresenter.ts (F27 layer 3 — pure code→key mapping).
 *
 * Tests the two pure functions the plan mandates in shared/reconciliationPresenter.ts:
 *   - presentLineStatus(status: BankStatementLineStatus) → i18n key string (BAS-061)
 *   - presentReconciliationError(err: BankStatementReconciliationError) → { key: string }
 *     for the draft-engine correction guards (BAS-064, BAS-090, BAS-094)
 *
 * No mocks, no React, no runtime i18n calls — the presenter is a pure function
 * that maps values to namespace-qualified keys; the caller's t() does the translation.
 *
 * These tests will fail until shared/reconciliationPresenter.ts is created.
 */
import { describe, expect, it } from "vitest";
import type {
  BankStatementLine,
  BankStatementLineStatus,
  BankStatementReconciliationError,
} from "@/bindings";

import {
  lineStatusTone,
  presentLineBadge,
  presentLineStatus,
  presentReconciliationError,
} from "./reconciliationPresenter";

function makeLine(overrides: Partial<BankStatementLine> = {}): BankStatementLine {
  return {
    line_id: "line-1",
    credit_line: { date: "2026-04-10", label: "CPAM75", amount: 150000 },
    status: "Matched",
    fund_id: "fund-1",
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
// presentLineStatus — BAS-061 six-status set
// ---------------------------------------------------------------------------

describe("presentLineStatus — BAS-061", () => {
  const cases: Array<{ status: BankStatementLineStatus; expectedKey: string }> = [
    { status: "Matched", expectedKey: "bank:reconciliation.status.matched" },
    { status: "NeedsLink", expectedKey: "bank:reconciliation.status.needs_link" },
    { status: "NeedsGroup", expectedKey: "bank:reconciliation.status.needs_group" },
    { status: "Partial", expectedKey: "bank:reconciliation.status.partial" },
    { status: "Rejected", expectedKey: "bank:reconciliation.status.rejected" },
    { status: "Unresolved", expectedKey: "bank:reconciliation.status.unresolved" },
  ];

  for (const { status, expectedKey } of cases) {
    it(`maps ${status} to ${expectedKey}`, () => {
      expect(presentLineStatus(status)).toBe(expectedKey);
    });
  }
});

// ---------------------------------------------------------------------------
// lineStatusTone — badge tone per status (BAS-061)
// ---------------------------------------------------------------------------

describe("lineStatusTone — BAS-061 badge tone", () => {
  const resolved: BankStatementLineStatus[] = ["Matched", "Rejected"];
  const attention: BankStatementLineStatus[] = ["NeedsGroup", "Partial", "Unresolved"];

  for (const status of resolved) {
    it(`maps ${status} to "resolved"`, () => {
      expect(lineStatusTone(status)).toBe("resolved");
    });
  }

  for (const status of attention) {
    it(`maps ${status} to "attention"`, () => {
      expect(lineStatusTone(status)).toBe("attention");
    });
  }

  // Fund-unknown must be distinguishable from transaction-missing (field
  // report 2026-07-30) — NeedsLink gets its own tone.
  it('maps NeedsLink to "link"', () => {
    expect(lineStatusTone("NeedsLink")).toBe("link");
  });
});

// ---------------------------------------------------------------------------

describe("presentReconciliationError — draft-engine correction guards", () => {
  it("maps AssignmentOverflow to a dedicated overflow key (BAS-094)", () => {
    const err: BankStatementReconciliationError = { code: "AssignmentOverflow" };
    expect(presentReconciliationError(err).key).toBe(
      "bank:reconciliation.error.assignment_overflow",
    );
  });

  it("maps GroupNotEligible to a dedicated eligibility key (BAS-090)", () => {
    const err: BankStatementReconciliationError = { code: "GroupNotEligible" };
    expect(presentReconciliationError(err).key).toBe(
      "bank:reconciliation.error.group_not_eligible",
    );
  });

  it("maps GroupAlreadyConsumed to a dedicated consumed key (BAS-067)", () => {
    const err: BankStatementReconciliationError = { code: "GroupAlreadyConsumed" };
    expect(presentReconciliationError(err).key).toBe(
      "bank:reconciliation.error.group_already_consumed",
    );
  });

  // BAS-113 — procedure-path mirrors of the group-path guards.
  it("maps ProcedureNotEligible to a dedicated eligibility key (BAS-113)", () => {
    const err: BankStatementReconciliationError = { code: "ProcedureNotEligible" };
    expect(presentReconciliationError(err).key).toBe(
      "bank:reconciliation.error.procedure_not_eligible",
    );
  });

  it("maps ProcedureAlreadyConsumed to a dedicated consumed key (BAS-113)", () => {
    const err: BankStatementReconciliationError = { code: "ProcedureAlreadyConsumed" };
    expect(presentReconciliationError(err).key).toBe(
      "bank:reconciliation.error.procedure_already_consumed",
    );
  });

  it("maps LineNotFound to the generic unknown key", () => {
    const err: BankStatementReconciliationError = { code: "LineNotFound" };
    expect(presentReconciliationError(err).key).toBe("bank:reconciliation.error.unknown");
  });

  it("maps FundNotFound to the generic unknown key", () => {
    const err: BankStatementReconciliationError = { code: "FundNotFound" };
    expect(presentReconciliationError(err).key).toBe("bank:reconciliation.error.unknown");
  });

  it("maps DatabaseError (infra catch-all) to the generic unknown key", () => {
    const err: BankStatementReconciliationError = { code: "DatabaseError" };
    expect(presentReconciliationError(err).key).toBe("bank:reconciliation.error.unknown");
  });

  it("maps BankAccountNotFound (BankError) to the generic unknown key", () => {
    const err: BankStatementReconciliationError = {
      code: "BankAccountNotFound",
      bank_account_id: "acc-1",
    };
    expect(presentReconciliationError(err).key).toBe("bank:reconciliation.error.unknown");
  });

  it("maps AmountNotPositive (BankError) to the generic unknown key", () => {
    const err: BankStatementReconciliationError = { code: "AmountNotPositive" };
    expect(presentReconciliationError(err).key).toBe("bank:reconciliation.error.unknown");
  });
});

// ---------------------------------------------------------------------------
// presentLineBadge — BAS-123C left-aside badge derivation
// ---------------------------------------------------------------------------

describe("presentLineBadge — BAS-123C", () => {
  it("maps a left-aside line (Matched, zero items, acknowledged remainder) to a distinct key", () => {
    const line = makeLine({
      status: "Matched",
      assigned_group_ids: [],
      assigned_procedure_ids: [],
      remainder_acknowledged: true,
    });

    const key = presentLineBadge(line);

    expect(key).toBe("bank:reconciliation.status.left_aside");
    // Distinct from the ordinary "Rapprochée" key (BAS-123C).
    expect(key).not.toBe(presentLineStatus("Matched"));
  });

  it("maps an ordinary matched line (assigned groups, no acknowledgment) to the matched key", () => {
    const line = makeLine({
      status: "Matched",
      assigned_group_ids: ["group-1"],
      assigned_procedure_ids: [],
      remainder_acknowledged: false,
    });

    expect(presentLineBadge(line)).toBe(presentLineStatus("Matched"));
  });

  it("maps a matched-via-procedures line (assigned procedures, no acknowledgment) to the matched key", () => {
    const line = makeLine({
      status: "Matched",
      assigned_group_ids: [],
      assigned_procedure_ids: ["proc-1"],
      remainder_acknowledged: false,
    });

    expect(presentLineBadge(line)).toBe(presentLineStatus("Matched"));
  });

  it("does not treat a Matched line with assigned groups AND an acknowledged remainder as left-aside", () => {
    // Defensive: left-aside is specifically the ZERO-item form (BAS-123B) —
    // a line with assigned items is never "left aside" even if somehow
    // remainder_acknowledged is also set.
    const line = makeLine({
      status: "Matched",
      assigned_group_ids: ["group-1"],
      assigned_procedure_ids: [],
      remainder_acknowledged: true,
    });

    expect(presentLineBadge(line)).toBe(presentLineStatus("Matched"));
  });

  it("falls back to presentLineStatus for every non-Matched status", () => {
    const statuses: BankStatementLineStatus[] = [
      "NeedsLink",
      "NeedsGroup",
      "Partial",
      "Rejected",
      "Unresolved",
    ];
    for (const status of statuses) {
      const line = makeLine({ status, remainder_acknowledged: false });
      expect(presentLineBadge(line)).toBe(presentLineStatus(status));
    }
  });
});
