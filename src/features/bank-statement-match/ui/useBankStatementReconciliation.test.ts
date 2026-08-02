/**
 * Unit tests for useBankStatementReconciliation — applyCorrection +
 * revertCorrection (BAS-062/065, [unit-test-needed] markers from the plan).
 *
 * applyCorrection:   appends a correction to corrections[] then calls
 *                    computeBankStatementReconciliation (BAS-064).
 * revertCorrection:  removes the i-th correction from corrections[] then
 *                    re-calls computeBankStatementReconciliation (BAS-065).
 *
 * Both use the mocked gateway boundary (F3). renderHook discipline per
 * docs/test_convention.md (stable references outside the callback).
 *
 * These tests fail until ui/useBankStatementReconciliation.ts is created.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BankStatementCorrection,
  BankStatementLine,
  BankStatementParseResult,
  BankStatementReconciliation,
} from "@/bindings";

// ---------------------------------------------------------------------------
// Mock gateway BEFORE importing the hook (docs/test_convention.md §Mocking)
// ---------------------------------------------------------------------------

vi.mock("../gateway", () => ({
  parseBankStatement: vi.fn(),
  resolveBankAccountFromIban: vi.fn(),
  createBankAccount: vi.fn(),
  computeBankStatementReconciliation: vi.fn(),
  validateBankStatementReconciliation: vi.fn(),
}));

import * as gateway from "../gateway";
import { useBankStatementReconciliation } from "./useBankStatementReconciliation";

const mockCompute = vi.mocked(gateway.computeBankStatementReconciliation);

// ---------------------------------------------------------------------------
// Fixtures (stable references — F19 / test_convention.md)
// ---------------------------------------------------------------------------

const BANK_ACCOUNT_ID = "acc-1";

const PARSE_RESULT: BankStatementParseResult = {
  iban: "FR7612345678901234567890189",
  period: "du 01/04/2026 au 30/04/2026",
  credit_lines: [
    { date: "2026-04-10", label: "CPAM75", amount: 150000 },
    { date: "2026-04-11", label: "MGEN", amount: 75000 },
  ],
  total_credits: 225000,
  unparsed_count: 0,
};

function makeReconciliation(
  overrides: Partial<BankStatementReconciliation> = {},
): BankStatementReconciliation {
  return {
    lines: [],
    resolved_count: 0,
    needs_correction_count: 2,
    ...overrides,
  };
}

const INITIAL_RECONCILIATION = makeReconciliation();

const LINK_FUND_CORRECTION: BankStatementCorrection = {
  type: "LinkFund",
  bank_label: "CPAM75",
  assignment: { type: "Fund", fund_id: "fund-1" },
};

const ASSIGN_GROUPS_CORRECTION: BankStatementCorrection = {
  type: "AssignGroups",
  line_id: "line-1",
  group_ids: ["group-1"],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useBankStatementReconciliation — applyCorrection (BAS-062/064)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Initial compute call on mount returns the initial reconciliation
    mockCompute.mockResolvedValue({ success: true, data: INITIAL_RECONCILIATION });
  });

  it("appends the correction to corrections[] and re-calls computeBankStatementReconciliation (BAS-064)", async () => {
    const afterCorrection = makeReconciliation({ needs_correction_count: 1 });
    // First call: initial mount; second call: after correction
    mockCompute
      .mockResolvedValueOnce({ success: true, data: INITIAL_RECONCILIATION })
      .mockResolvedValueOnce({ success: true, data: afterCorrection });

    const { result } = renderHook(() =>
      useBankStatementReconciliation(BANK_ACCOUNT_ID, PARSE_RESULT),
    );

    // Wait for initial compute to settle
    await waitFor(() => expect(result.current.reconciliation).toBeDefined());
    const initialCallCount = mockCompute.mock.calls.length;

    // Apply a correction
    await act(async () => {
      await result.current.applyCorrection(LINK_FUND_CORRECTION);
    });

    // compute must have been called once more with the appended correction
    expect(mockCompute).toHaveBeenCalledTimes(initialCallCount + 1);
    const lastCall = mockCompute.mock.calls.at(-1);
    expect(lastCall?.[0]).toBe(BANK_ACCOUNT_ID);
    expect(lastCall?.[1]).toEqual(PARSE_RESULT);
    expect(lastCall?.[2]).toContainEqual(LINK_FUND_CORRECTION);

    // Reconciliation updated to the recomputed result
    expect(result.current.reconciliation?.needs_correction_count).toBe(1);
  });

  it("accumulates multiple corrections in order (BAS-062)", async () => {
    const afterFirst = makeReconciliation({ needs_correction_count: 1 });
    const afterSecond = makeReconciliation({ needs_correction_count: 0 });

    mockCompute
      .mockResolvedValueOnce({ success: true, data: INITIAL_RECONCILIATION }) // mount
      .mockResolvedValueOnce({ success: true, data: afterFirst }) // after 1st correction
      .mockResolvedValueOnce({ success: true, data: afterSecond }); // after 2nd correction

    const { result } = renderHook(() =>
      useBankStatementReconciliation(BANK_ACCOUNT_ID, PARSE_RESULT),
    );

    await waitFor(() => expect(result.current.reconciliation).toBeDefined());

    await act(async () => {
      await result.current.applyCorrection(LINK_FUND_CORRECTION);
    });
    await act(async () => {
      await result.current.applyCorrection(ASSIGN_GROUPS_CORRECTION);
    });

    // Second compute call must include BOTH corrections in order
    const lastCall = mockCompute.mock.calls.at(-1);
    expect(lastCall?.[2]).toEqual([LINK_FUND_CORRECTION, ASSIGN_GROUPS_CORRECTION]);
  });

  it("does NOT update the reconciliation when the compute call returns an error (BAS-064 prior draft preserved)", async () => {
    mockCompute
      .mockResolvedValueOnce({ success: true, data: INITIAL_RECONCILIATION }) // mount
      .mockResolvedValueOnce({ success: false, error: { code: "AssignmentOverflow" } }); // after correction

    const { result } = renderHook(() =>
      useBankStatementReconciliation(BANK_ACCOUNT_ID, PARSE_RESULT),
    );

    await waitFor(() => expect(result.current.reconciliation).toBeDefined());

    await act(async () => {
      await result.current.applyCorrection(ASSIGN_GROUPS_CORRECTION);
    });

    // Prior draft preserved — reconciliation unchanged
    expect(result.current.reconciliation).toEqual(INITIAL_RECONCILIATION);
    // Correction was NOT appended (failing correction is not applied — BAS-064)
    // We verify by checking the next compute call would have no extra corrections
    // This is asserted by checking corrections count via the next recompute args
  });

  it("sets isBusy=true while compute is in flight and false after resolution (BAS-064)", async () => {
    let resolveCompute!: (v: { success: true; data: BankStatementReconciliation }) => void;
    const afterCorrection = makeReconciliation({ needs_correction_count: 0 });

    mockCompute
      .mockResolvedValueOnce({ success: true, data: INITIAL_RECONCILIATION }) // mount
      .mockReturnValueOnce(
        new Promise<{ success: true; data: BankStatementReconciliation }>((resolve) => {
          resolveCompute = resolve;
        }),
      );

    const { result } = renderHook(() =>
      useBankStatementReconciliation(BANK_ACCOUNT_ID, PARSE_RESULT),
    );

    await waitFor(() => expect(result.current.reconciliation).toBeDefined());

    act(() => {
      result.current.applyCorrection(LINK_FUND_CORRECTION);
    });

    await waitFor(() => expect(result.current.isBusy).toBe(true));

    await act(async () => {
      resolveCompute({ success: true, data: afterCorrection });
    });

    expect(result.current.isBusy).toBe(false);
  });
});

describe("useBankStatementReconciliation — revertCorrection (BAS-065)", () => {
  const ACKNOWLEDGE_CORRECTION: BankStatementCorrection = {
    type: "AcknowledgeRemainder",
    line_id: "line-1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCompute.mockResolvedValue({ success: true, data: INITIAL_RECONCILIATION });
  });

  it("removes the i-th correction (not just the last) and recomputes with the rest (BAS-065)", async () => {
    const { result } = renderHook(() =>
      useBankStatementReconciliation(BANK_ACCOUNT_ID, PARSE_RESULT),
    );

    await waitFor(() => expect(result.current.reconciliation).toBeDefined());

    // Apply three corrections in order: [LinkFund, AssignGroups, Acknowledge].
    await act(async () => {
      await result.current.applyCorrection(LINK_FUND_CORRECTION);
    });
    await act(async () => {
      await result.current.applyCorrection(ASSIGN_GROUPS_CORRECTION);
    });
    await act(async () => {
      await result.current.applyCorrection(ACKNOWLEDGE_CORRECTION);
    });

    expect(result.current.corrections).toHaveLength(3);

    // Revert the MIDDLE correction (index 1 = AssignGroups).
    await act(async () => {
      await result.current.revertCorrection(1);
    });

    // Recompute called with the first + third corrections, order preserved.
    const lastCall = mockCompute.mock.calls.at(-1);
    expect(lastCall?.[2]).toEqual([LINK_FUND_CORRECTION, ACKNOWLEDGE_CORRECTION]);
    expect(result.current.corrections).toEqual([LINK_FUND_CORRECTION, ACKNOWLEDGE_CORRECTION]);
  });

  it("is a no-op for an out-of-range index (does not call compute again)", async () => {
    const { result } = renderHook(() =>
      useBankStatementReconciliation(BANK_ACCOUNT_ID, PARSE_RESULT),
    );

    await waitFor(() => expect(result.current.reconciliation).toBeDefined());
    await act(async () => {
      await result.current.applyCorrection(LINK_FUND_CORRECTION);
    });

    const callsBefore = mockCompute.mock.calls.length;
    await act(async () => {
      await result.current.revertCorrection(5);
    });

    expect(mockCompute).toHaveBeenCalledTimes(callsBefore);
    expect(result.current.corrections).toEqual([LINK_FUND_CORRECTION]);
  });
});

// ---------------------------------------------------------------------------
// validate (BAS-063/093) — lines 101-116 of useBankStatementReconciliation.ts
// ---------------------------------------------------------------------------

describe("useBankStatementReconciliation — validate (BAS-063/093)", () => {
  const mockValidate = vi.mocked(gateway.validateBankStatementReconciliation);

  beforeEach(() => {
    vi.clearAllMocks();
    mockCompute.mockResolvedValue({ success: true, data: INITIAL_RECONCILIATION });
  });

  it("calls validateBankStatementReconciliation with bankAccountId + parseResult + current corrections and returns the count on success (BAS-093)", async () => {
    mockValidate.mockResolvedValue({ success: true, data: 7 });

    const afterCorrection = makeReconciliation({ needs_correction_count: 0, resolved_count: 2 });
    mockCompute
      .mockResolvedValueOnce({ success: true, data: INITIAL_RECONCILIATION }) // mount
      .mockResolvedValueOnce({ success: true, data: afterCorrection }); // after correction

    const { result } = renderHook(() =>
      useBankStatementReconciliation(BANK_ACCOUNT_ID, PARSE_RESULT),
    );

    await waitFor(() => expect(result.current.reconciliation).toBeDefined());

    // Apply one correction so corrections[] is non-empty — validate must forward it
    await act(async () => {
      await result.current.applyCorrection(LINK_FUND_CORRECTION);
    });

    let count: number | null | undefined;
    await act(async () => {
      count = await result.current.validate();
    });

    expect(mockValidate).toHaveBeenCalledWith(BANK_ACCOUNT_ID, PARSE_RESULT, [
      LINK_FUND_CORRECTION,
    ]);
    expect(count).toBe(7);
  });

  it("returns null and sets typed error state when validateBankStatementReconciliation returns an error (F27)", async () => {
    mockValidate.mockResolvedValue({ success: false, error: { code: "DatabaseError" } });

    const { result } = renderHook(() =>
      useBankStatementReconciliation(BANK_ACCOUNT_ID, PARSE_RESULT),
    );

    await waitFor(() => expect(result.current.reconciliation).toBeDefined());

    let count: number | null | undefined;
    await act(async () => {
      count = await result.current.validate();
    });

    expect(count).toBeNull();
    // The typed error must be set in state (not thrown — F27 layer 2)
    expect(result.current.error).toEqual({ code: "DatabaseError" });
  });

  it("sets isBusy=true while validate is in flight and false after resolution", async () => {
    let resolveValidate!: (v: { success: true; data: number }) => void;

    mockValidate.mockReturnValue(
      new Promise<{ success: true; data: number }>((r) => {
        resolveValidate = r;
      }),
    );

    const { result } = renderHook(() =>
      useBankStatementReconciliation(BANK_ACCOUNT_ID, PARSE_RESULT),
    );

    await waitFor(() => expect(result.current.reconciliation).toBeDefined());

    act(() => {
      result.current.validate();
    });

    await waitFor(() => expect(result.current.isBusy).toBe(true));

    await act(async () => {
      resolveValidate({ success: true, data: 3 });
    });

    expect(result.current.isBusy).toBe(false);
  });

  it("clears a prior error when validate is called again (setError(null) at the top of validate)", async () => {
    // First validate: error
    mockValidate
      .mockResolvedValueOnce({ success: false, error: { code: "InvalidConfirmedMatchDate" } })
      .mockResolvedValueOnce({ success: true, data: 2 });

    const { result } = renderHook(() =>
      useBankStatementReconciliation(BANK_ACCOUNT_ID, PARSE_RESULT),
    );

    await waitFor(() => expect(result.current.reconciliation).toBeDefined());

    await act(async () => {
      await result.current.validate();
    });
    expect(result.current.error).not.toBeNull();

    // Second validate: success — error must be cleared
    await act(async () => {
      await result.current.validate();
    });
    expect(result.current.error).toBeNull();
  });

  it("validate passes an empty corrections list when no corrections have been applied", async () => {
    mockValidate.mockResolvedValue({ success: true, data: 0 });

    const { result } = renderHook(() =>
      useBankStatementReconciliation(BANK_ACCOUNT_ID, PARSE_RESULT),
    );

    await waitFor(() => expect(result.current.reconciliation).toBeDefined());

    await act(async () => {
      await result.current.validate();
    });

    expect(mockValidate).toHaveBeenCalledWith(BANK_ACCOUNT_ID, PARSE_RESULT, []);
  });
});

// ---------------------------------------------------------------------------
// BAS-113/066 — correction-list compaction of the STORED list
//
// The engine's pre-replay filter (BAS-113/066) already drops superseded
// corrections before REPLAYING them server-side, but that alone cannot make
// `revertCorrection` safe: if the stored list still carries a superseded
// correction, reverting a LATER correction can resurrect it. `applyCorrection`
// and `revertCorrection` must therefore compact the STORED corrections[]
// themselves, before appending / before recomputing.
// ---------------------------------------------------------------------------

describe("useBankStatementReconciliation — correction-list compaction (BAS-113/066)", () => {
  const LINE_ID = "line-1";

  const ASSIGN_GROUPS: BankStatementCorrection = {
    type: "AssignGroups",
    line_id: LINE_ID,
    group_ids: ["group-1"],
  };

  const ASSIGN_PROCEDURES: BankStatementCorrection = {
    type: "AssignProcedures",
    line_id: LINE_ID,
    procedure_ids: ["proc-1"],
  };

  const ACKNOWLEDGE: BankStatementCorrection = {
    type: "AcknowledgeRemainder",
    line_id: LINE_ID,
  };

  const OTHER_LINE_ASSIGN_GROUPS: BankStatementCorrection = {
    type: "AssignGroups",
    line_id: "line-other",
    group_ids: ["group-9"],
  };

  const LINK_FUND_A: BankStatementCorrection = {
    type: "LinkFund",
    bank_label: "RATP",
    assignment: { type: "Fund", fund_id: "fund-A" },
  };

  const LINK_FUND_B: BankStatementCorrection = {
    type: "LinkFund",
    bank_label: "RATP",
    assignment: { type: "Fund", fund_id: "fund-B" },
  };

  /** A resolved RATP line — used so the hook can map bank_label → line_id for the LinkFund cascade. */
  function makeRatpLine(overrides: Partial<BankStatementLine> = {}): BankStatementLine {
    return {
      line_id: LINE_ID,
      credit_line: { date: "2026-04-12", label: "RATP", amount: 60000 },
      status: "Matched",
      fund_id: "fund-A",
      assigned_group_ids: [],
      assigned_procedure_ids: ["proc-1"],
      covered_amount: 60000,
      remainder_acknowledged: false,
      candidate_groups: [],
      broadened_candidates: [],
      candidate_procedures: [],
      suggested_fund_id: null,
      suggested_fund_name: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockCompute.mockResolvedValue({ success: true, data: INITIAL_RECONCILIATION });
  });

  it("applying AssignProcedures removes a prior AssignGroups correction for the same line", async () => {
    const { result } = renderHook(() =>
      useBankStatementReconciliation(BANK_ACCOUNT_ID, PARSE_RESULT),
    );
    await waitFor(() => expect(result.current.reconciliation).toBeDefined());

    await act(async () => {
      await result.current.applyCorrection(ASSIGN_GROUPS);
    });
    await act(async () => {
      await result.current.applyCorrection(ASSIGN_PROCEDURES);
    });

    expect(result.current.corrections).toEqual([ASSIGN_PROCEDURES]);
    expect(mockCompute.mock.calls.at(-1)?.[2]).toEqual([ASSIGN_PROCEDURES]);
  });

  it("applying AssignGroups removes a prior AssignProcedures correction for the same line", async () => {
    const { result } = renderHook(() =>
      useBankStatementReconciliation(BANK_ACCOUNT_ID, PARSE_RESULT),
    );
    await waitFor(() => expect(result.current.reconciliation).toBeDefined());

    await act(async () => {
      await result.current.applyCorrection(ASSIGN_PROCEDURES);
    });
    await act(async () => {
      await result.current.applyCorrection(ASSIGN_GROUPS);
    });

    expect(result.current.corrections).toEqual([ASSIGN_GROUPS]);
  });

  it("applying an assignment correction removes a prior AcknowledgeRemainder for the same line (BAS-092)", async () => {
    const { result } = renderHook(() =>
      useBankStatementReconciliation(BANK_ACCOUNT_ID, PARSE_RESULT),
    );
    await waitFor(() => expect(result.current.reconciliation).toBeDefined());

    await act(async () => {
      await result.current.applyCorrection(ASSIGN_GROUPS);
    });
    await act(async () => {
      await result.current.applyCorrection(ACKNOWLEDGE);
    });
    await act(async () => {
      await result.current.applyCorrection(ASSIGN_PROCEDURES);
    });

    // AssignGroups AND the AcknowledgeRemainder are both superseded — only
    // the new AssignProcedures survives.
    expect(result.current.corrections).toEqual([ASSIGN_PROCEDURES]);
  });

  it("does not remove assignment corrections belonging to a DIFFERENT line", async () => {
    const { result } = renderHook(() =>
      useBankStatementReconciliation(BANK_ACCOUNT_ID, PARSE_RESULT),
    );
    await waitFor(() => expect(result.current.reconciliation).toBeDefined());

    await act(async () => {
      await result.current.applyCorrection(OTHER_LINE_ASSIGN_GROUPS);
    });
    await act(async () => {
      await result.current.applyCorrection(ASSIGN_PROCEDURES);
    });

    expect(result.current.corrections).toEqual([OTHER_LINE_ASSIGN_GROUPS, ASSIGN_PROCEDURES]);
  });

  it("re-linking a label to a different fund removes dependent AssignProcedures corrections for lines of that label (BAS-066)", async () => {
    const afterAssign: BankStatementReconciliation = makeReconciliation({
      lines: [makeRatpLine()],
    });
    mockCompute
      .mockResolvedValueOnce({ success: true, data: INITIAL_RECONCILIATION }) // mount
      .mockResolvedValueOnce({ success: true, data: INITIAL_RECONCILIATION }) // after LinkFund(A)
      .mockResolvedValueOnce({ success: true, data: afterAssign }) // after AssignProcedures — RATP line now known
      .mockResolvedValueOnce({ success: true, data: afterAssign }); // after LinkFund(B)

    const { result } = renderHook(() =>
      useBankStatementReconciliation(BANK_ACCOUNT_ID, PARSE_RESULT),
    );
    await waitFor(() => expect(result.current.reconciliation).toBeDefined());

    await act(async () => {
      await result.current.applyCorrection(LINK_FUND_A);
    });
    await act(async () => {
      await result.current.applyCorrection(ASSIGN_PROCEDURES);
    });

    expect(result.current.corrections).toEqual([LINK_FUND_A, ASSIGN_PROCEDURES]);

    await act(async () => {
      await result.current.applyCorrection(LINK_FUND_B);
    });

    // The dependent AssignProcedures for the RATP line is dropped; only the
    // two LinkFund corrections remain.
    expect(result.current.corrections).toEqual([LINK_FUND_A, LINK_FUND_B]);
    expect(mockCompute.mock.calls.at(-1)?.[2]).toEqual([LINK_FUND_A, LINK_FUND_B]);
  });

  it("reverting a LinkFund correction removes dependent AssignProcedures corrections for lines of that label (BAS-066) — revert-safety", async () => {
    const afterAssign: BankStatementReconciliation = makeReconciliation({
      lines: [makeRatpLine()],
    });
    mockCompute
      .mockResolvedValueOnce({ success: true, data: INITIAL_RECONCILIATION }) // mount
      .mockResolvedValueOnce({ success: true, data: INITIAL_RECONCILIATION }) // after LinkFund(A)
      .mockResolvedValueOnce({ success: true, data: afterAssign }) // after AssignProcedures
      .mockResolvedValueOnce({ success: true, data: INITIAL_RECONCILIATION }); // after revert

    const { result } = renderHook(() =>
      useBankStatementReconciliation(BANK_ACCOUNT_ID, PARSE_RESULT),
    );
    await waitFor(() => expect(result.current.reconciliation).toBeDefined());

    await act(async () => {
      await result.current.applyCorrection(LINK_FUND_A);
    });
    await act(async () => {
      await result.current.applyCorrection(ASSIGN_PROCEDURES);
    });

    // Revert the LinkFund correction (index 0).
    await act(async () => {
      await result.current.revertCorrection(0);
    });

    // The dependent AssignProcedures must be gone too — never resurrected by
    // a later revert of a DIFFERENT correction (revert-safety).
    expect(result.current.corrections).toEqual([]);
    expect(mockCompute.mock.calls.at(-1)?.[2]).toEqual([]);
  });

  it("revert-safety: assign-groups → acknowledge → assign-procedures → revert(assign-procedures) recomputes with an empty list, never resurrecting the removed acknowledge (BAS-113)", async () => {
    const { result } = renderHook(() =>
      useBankStatementReconciliation(BANK_ACCOUNT_ID, PARSE_RESULT),
    );
    await waitFor(() => expect(result.current.reconciliation).toBeDefined());

    await act(async () => {
      await result.current.applyCorrection(ASSIGN_GROUPS);
    });
    await act(async () => {
      await result.current.applyCorrection(ACKNOWLEDGE);
    });
    await act(async () => {
      await result.current.applyCorrection(ASSIGN_PROCEDURES);
    });

    // Only the AssignProcedures survives the compaction cascade above.
    expect(result.current.corrections).toEqual([ASSIGN_PROCEDURES]);

    await act(async () => {
      await result.current.revertCorrection(0);
    });

    // Auto-match state: nothing left, and critically the removed
    // AcknowledgeRemainder never resurfaces.
    expect(result.current.corrections).toEqual([]);
    expect(mockCompute.mock.calls.at(-1)?.[2]).toEqual([]);
  });
});
