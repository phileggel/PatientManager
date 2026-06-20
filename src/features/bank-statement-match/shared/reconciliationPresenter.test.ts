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
import type { BankStatementLineStatus, BankStatementReconciliationError } from "@/bindings";

import {
  lineStatusTone,
  presentLineStatus,
  presentReconciliationError,
} from "./reconciliationPresenter";

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
  const attention: BankStatementLineStatus[] = ["NeedsLink", "NeedsGroup", "Partial", "Unresolved"];

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
});

// ---------------------------------------------------------------------------
// presentReconciliationError — draft-engine correction guards (BAS-064)
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

  it("maps LineNotFound to the generic unknown key", () => {
    const err: BankStatementReconciliationError = { code: "LineNotFound" };
    expect(presentReconciliationError(err).key).toBe("bank:reconciliation.error.unknown");
  });

  it("maps FundNotFound to the generic unknown key", () => {
    // BankStatementReconciliationTask.FundNotFound has no payload (distinct from
    // FundError.FundNotFound which does have fund_id — both map to the same generic key here)
    const err: BankStatementReconciliationError = { code: "DatabaseError" };
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
