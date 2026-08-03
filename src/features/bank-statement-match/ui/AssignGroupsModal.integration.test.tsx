/**
 * RTL component integration tests — AssignGroupsModal (BAS-068/090/091/094).
 *
 * Tests:
 *   - ranked candidates rendered (BAS-068)
 *   - live balance updates as groups are selected (BAS-091)
 *   - overflow guard prevents over-assignment (BAS-094)
 *   - submitting produces AssignGroups correction (BAS-090)
 *   - empty group_ids (unassign) is valid submission (BAS-062 override path)
 *
 * Mocks gateway at feature boundary (F3). Stable id selectors (F25).
 * These tests fail until ui/AssignGroupsModal.tsx is created.
 */

import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BankStatementCandidate,
  BankStatementCorrection,
  BankStatementLine,
  BankStatementProcedureCandidate,
} from "@/bindings";

vi.mock("../gateway", () => ({
  computeBankStatementReconciliation: vi.fn(),
  validateBankStatementReconciliation: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
    i18n: { language: "fr" },
  }),
}));

import { AssignGroupsModal } from "./AssignGroupsModal";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CANDIDATE_EXACT: BankStatementCandidate = {
  group_id: "group-1",
  fund_id: "fund-1",
  fund_name: "CPAM Paris",
  payment_date: "2026-04-08",
  total_amount: 150000,
  is_exact_amount: true,
};

const CANDIDATE_PARTIAL: BankStatementCandidate = {
  group_id: "group-2",
  fund_id: "fund-1",
  fund_name: "CPAM Paris",
  payment_date: "2026-04-06",
  total_amount: 80000,
  is_exact_amount: false,
};

const CANDIDATE_PARTIAL_2: BankStatementCandidate = {
  group_id: "group-3",
  fund_id: "fund-1",
  fund_name: "CPAM Paris",
  payment_date: "2026-04-05",
  total_amount: 70000,
  is_exact_amount: false,
};

const PROCEDURE_CANDIDATE_1: BankStatementProcedureCandidate = {
  procedure_id: "proc-1",
  patient_name: "Jean Dupont",
  procedure_date: "2026-03-01",
  billed_amount: 60000,
  is_exact_amount: false,
};

const PROCEDURE_CANDIDATE_2: BankStatementProcedureCandidate = {
  procedure_id: "proc-2",
  patient_name: "Marie Curie",
  procedure_date: "2026-03-10",
  billed_amount: 90000,
  is_exact_amount: false,
};

function makeNeedsGroupLine(overrides: Partial<BankStatementLine> = {}): BankStatementLine {
  return {
    line_id: "line-needs-group",
    credit_line: { date: "2026-04-10", label: "CPAM75", amount: 150000 },
    status: "NeedsGroup",
    fund_id: "fund-1",
    assigned_group_ids: [],
    assigned_procedure_ids: [],
    covered_amount: 0,
    remainder_acknowledged: false,
    candidate_groups: [CANDIDATE_EXACT, CANDIDATE_PARTIAL],
    broadened_candidates: [],
    candidate_procedures: [],
    suggested_fund_id: null,
    suggested_fund_name: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AssignGroupsModal — BAS-068/090/091/094", () => {
  beforeEach(() => vi.clearAllMocks());

  // BAS-068 — candidate groups rendered, exact-amount first
  it("renders candidates in wire order with stable ids and exact-amount flag (BAS-068)", () => {
    const line = makeNeedsGroupLine();

    render(<AssignGroupsModal line={line} isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);

    // Each candidate has a stable row id
    const candidateRow1 = document.getElementById("assign-groups-candidate-group-1");
    const candidateRow2 = document.getElementById("assign-groups-candidate-group-2");
    expect(candidateRow1).not.toBeNull();
    expect(candidateRow2).not.toBeNull();

    // Each row identifies its fund by name (BAS-068)
    expect(candidateRow1?.textContent).toContain("CPAM Paris");

    // The wire order (backend: most recent payment first) renders as-is —
    // no client-side re-sort.
    const allRows = document.querySelectorAll("[id^='assign-groups-candidate-']");
    expect(allRows[0]?.id).toBe("assign-groups-candidate-group-1");
    expect(allRows[1]?.id).toBe("assign-groups-candidate-group-2");

    // The exact-amount candidate carries the flag; the partial one does not.
    expect(document.getElementById("assign-groups-exact-group-1")).not.toBeNull();
    expect(document.getElementById("assign-groups-exact-group-2")).toBeNull();
  });

  // BAS-090 — selecting a group and submitting produces AssignGroups correction
  it("calls onSubmit with AssignGroups correction containing selected group id (BAS-090)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const line = makeNeedsGroupLine();

    render(<AssignGroupsModal line={line} isOpen={true} onSubmit={onSubmit} onCancel={vi.fn()} />);

    // Select group-1 via its checkbox/row
    const checkbox = document.getElementById("assign-groups-check-group-1");
    expect(checkbox).not.toBeNull();
    if (!checkbox) throw new Error("candidate checkbox missing");

    await user.click(checkbox);

    const submitBtn = document.getElementById("assign-groups-submit");
    expect(submitBtn).not.toBeNull();
    if (!submitBtn) throw new Error("submit button missing");

    await user.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledWith({
      type: "AssignGroups",
      line_id: "line-needs-group",
      group_ids: ["group-1"],
    });
  });

  // BAS-091 — live balance shows covered amount vs line amount
  it("renders a live balance element that updates when a group is selected (BAS-091)", async () => {
    const user = userEvent.setup();
    const line = makeNeedsGroupLine({
      candidate_groups: [CANDIDATE_PARTIAL, CANDIDATE_PARTIAL_2],
    });

    render(<AssignGroupsModal line={line} isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);

    const balanceEl = document.getElementById("assign-groups-balance");
    expect(balanceEl).not.toBeNull();

    // Initially covered_amount=0 (no selection); the balance element exists
    expect(balanceEl?.textContent).toBeTruthy();

    // Select the partial group — balance should reflect 80000 covered
    const checkbox = document.getElementById("assign-groups-check-group-2");
    if (!checkbox) throw new Error("candidate checkbox missing");
    await user.click(checkbox);

    // Balance element still present and updated (exact text is i18n-formatted, so
    // we assert presence + that the element now includes "80" somewhere — the
    // currency formatter will output something containing this amount)
    const updatedBalance = document.getElementById("assign-groups-balance");
    expect(updatedBalance?.textContent).toMatch(/80/);
  });

  // BAS-094 — overflow guard: selecting groups that exceed line amount disables submit
  it("disables the submit button when selected group total exceeds line amount (BAS-094)", async () => {
    const user = userEvent.setup();
    // Two partial groups whose totals sum to 150001 (overflow)
    const overflowCandidate1: BankStatementCandidate = {
      ...CANDIDATE_PARTIAL,
      total_amount: 100000,
    };
    const overflowCandidate2: BankStatementCandidate = {
      ...CANDIDATE_PARTIAL_2,
      total_amount: 80000,
    };
    const line = makeNeedsGroupLine({
      credit_line: { date: "2026-04-10", label: "CPAM75", amount: 150000 },
      candidate_groups: [overflowCandidate1, overflowCandidate2],
    });

    render(<AssignGroupsModal line={line} isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);

    // Select both groups — 100000 + 80000 = 180000 > 150000
    const cb1 = document.getElementById("assign-groups-check-group-2");
    const cb2 = document.getElementById("assign-groups-check-group-3");
    if (!cb1 || !cb2) throw new Error("candidate checkboxes missing");

    await user.click(cb1);
    await user.click(cb2);

    const submitBtn = document.getElementById("assign-groups-submit") as HTMLButtonElement | null;
    expect(submitBtn).not.toBeNull();
    expect(submitBtn?.disabled).toBe(true);
  });

  // BAS-062 override — the seeded assignment can be unchecked and submitted
  // empty (explicit unassign).
  it("submits empty group_ids after unchecking the seeded assignment (unassign override, BAS-062)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    // A line that already has an assignment — user opens it to unassign
    const line = makeNeedsGroupLine({
      status: "Matched",
      assigned_group_ids: ["group-1"],
      covered_amount: 150000,
    });

    render(<AssignGroupsModal line={line} isOpen={true} onSubmit={onSubmit} onCancel={vi.fn()} />);

    // The current assignment is seeded (BAS-068) — uncheck it to unassign.
    const seeded = document.getElementById("assign-groups-check-group-1") as HTMLInputElement;
    expect(seeded?.checked).toBe(true);
    await user.click(seeded);

    const submitBtn = document.getElementById("assign-groups-submit");
    expect(submitBtn).not.toBeNull();
    if (!submitBtn) throw new Error("submit button missing");

    await user.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledWith({
      type: "AssignGroups",
      line_id: "line-needs-group",
      group_ids: [],
    });
  });

  // BAS-068/111 — the "all funds" scope swaps the fund-filtered set for the
  // fund-agnostic superset, revealing a candidate from a different fund not in
  // the default ("this fund") scope. The former standalone broaden button is
  // now the second of the three explicit scopes (BAS-111).
  it("reveals a different-fund candidate when the all-funds scope is selected (BAS-111)", async () => {
    const user = userEvent.setup();
    const OTHER_FUND_CANDIDATE: BankStatementCandidate = {
      group_id: "group-other-fund",
      fund_id: "fund-2",
      fund_name: "Mutuelle Générale",
      payment_date: "2026-04-07",
      total_amount: 150000,
      is_exact_amount: true,
    };
    const line = makeNeedsGroupLine({
      candidate_groups: [CANDIDATE_EXACT],
      broadened_candidates: [CANDIDATE_EXACT, OTHER_FUND_CANDIDATE],
    });

    render(<AssignGroupsModal line={line} isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);

    // Default ("this fund") scope: the other-fund candidate is NOT shown.
    expect(document.getElementById("assign-groups-candidate-group-other-fund")).toBeNull();

    const allFundsScope = document.getElementById("assign-groups-scope-all");
    expect(allFundsScope).not.toBeNull();
    if (!allFundsScope) throw new Error("all-funds scope control missing");

    await user.click(allFundsScope);

    // "All funds" scope: the other-fund candidate now appears.
    expect(document.getElementById("assign-groups-candidate-group-other-fund")).not.toBeNull();

    // Switching back to "this fund" restores the fund-filtered set.
    const fundScope = document.getElementById("assign-groups-scope-fund");
    if (!fundScope) throw new Error("fund scope control missing");
    await user.click(fundScope);
    expect(document.getElementById("assign-groups-candidate-group-other-fund")).toBeNull();
  });

  // BAS-111 — switching scope ALWAYS clears the visible selection (never
  // silently spans scopes), regardless of whether the new scope is a superset.
  it("clears the selection when switching from the all-funds scope back to this fund (BAS-111)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const OTHER_FUND_CANDIDATE: BankStatementCandidate = {
      group_id: "group-other-fund",
      fund_id: "fund-2",
      fund_name: "Mutuelle Générale",
      payment_date: "2026-04-07",
      total_amount: 150000,
      is_exact_amount: true,
    };
    const line = makeNeedsGroupLine({
      candidate_groups: [CANDIDATE_EXACT],
      broadened_candidates: [CANDIDATE_EXACT, OTHER_FUND_CANDIDATE],
    });

    render(<AssignGroupsModal line={line} isOpen={true} onSubmit={onSubmit} onCancel={vi.fn()} />);

    const allFundsScope = document.getElementById("assign-groups-scope-all");
    if (!allFundsScope) throw new Error("all-funds scope control missing");

    // Switch to all-funds, select the other-fund candidate, then switch back.
    await user.click(allFundsScope);
    const otherFundCheck = document.getElementById("assign-groups-check-group-other-fund");
    if (!otherFundCheck) throw new Error("broadened candidate checkbox missing");
    await user.click(otherFundCheck);

    const fundScope = document.getElementById("assign-groups-scope-fund");
    if (!fundScope) throw new Error("fund scope control missing");
    await user.click(fundScope);

    const submitBtn = document.getElementById("assign-groups-submit");
    if (!submitBtn) throw new Error("submit button missing");
    await user.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledWith({
      type: "AssignGroups",
      line_id: "line-needs-group",
      group_ids: [],
    });
  });

  // BAS-068 — the selection is seeded with the line's current assignment so
  // submitting recomposes rather than silently dropping existing groups.
  it("pre-selects the line's currently assigned groups", () => {
    const line = makeNeedsGroupLine({
      status: "Partial",
      assigned_group_ids: ["group-2"],
      covered_amount: 80000,
    });

    render(<AssignGroupsModal line={line} isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);

    const seeded = document.getElementById("assign-groups-check-group-2") as HTMLInputElement;
    expect(seeded?.checked).toBe(true);
    const other = document.getElementById("assign-groups-check-group-1") as HTMLInputElement;
    expect(other?.checked).toBe(false);
    // The former standalone acknowledge affordance is removed (2026-07-31
    // wireframe review) — the remainder is informational text only, and
    // acknowledging happens via the "Rapprocher avec reliquat" footer action.
    expect(document.getElementById("assign-groups-acknowledge-remainder")).toBeNull();
    expect(document.getElementById("assign-groups-remainder-info")).not.toBeNull();
  });

  // BAS-090 — unchecking a selected candidate removes it from the submission.
  it("deselects a candidate on second click and submits without it", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const line = makeNeedsGroupLine();

    render(<AssignGroupsModal line={line} isOpen={true} onSubmit={onSubmit} onCancel={vi.fn()} />);

    const check = document.getElementById("assign-groups-check-group-1");
    if (!check) throw new Error("candidate checkbox missing");
    await user.click(check);
    await user.click(check);

    const submitBtn = document.getElementById("assign-groups-submit");
    if (!submitBtn) throw new Error("submit button missing");
    await user.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledWith({
      type: "AssignGroups",
      line_id: "line-needs-group",
      group_ids: [],
    });
  });

  it("calls onCancel and does not call onSubmit when cancel is clicked", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const line = makeNeedsGroupLine();

    render(<AssignGroupsModal line={line} isOpen={true} onSubmit={onSubmit} onCancel={onCancel} />);

    const cancelBtn = document.getElementById("assign-groups-cancel");
    expect(cancelBtn).not.toBeNull();
    if (!cancelBtn) throw new Error("cancel button missing");

    await user.click(cancelBtn);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // BAS-111 — three-scope segmented control + default-scope rule
  // ---------------------------------------------------------------------------

  describe("BAS-111 — search scopes", () => {
    it("offers all three scopes for a linked line with group AND procedure candidates", () => {
      const line = makeNeedsGroupLine({ candidate_procedures: [PROCEDURE_CANDIDATE_1] });

      render(<AssignGroupsModal line={line} isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);

      expect(document.getElementById("assign-groups-scope-fund")).not.toBeNull();
      expect(document.getElementById("assign-groups-scope-all")).not.toBeNull();
      expect(document.getElementById("assign-groups-scope-procedures")).not.toBeNull();
    });

    it("does not offer the procedure scope when the line's fund is unknown (rejected/unlinked label)", () => {
      const line = makeNeedsGroupLine({
        status: "Rejected",
        fund_id: null,
        candidate_groups: [],
        candidate_procedures: [PROCEDURE_CANDIDATE_1],
      });

      render(<AssignGroupsModal line={line} isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);

      expect(document.getElementById("assign-groups-scope-procedures")).toBeNull();
    });

    it("defaults to the fund-filtered group scope when group candidates exist", () => {
      const line = makeNeedsGroupLine({ candidate_procedures: [PROCEDURE_CANDIDATE_1] });

      render(<AssignGroupsModal line={line} isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);

      expect(
        document.getElementById("assign-groups-scope-fund")?.getAttribute("aria-pressed"),
      ).toBe("true");
      // Group candidates render immediately, procedure candidates do not.
      expect(document.getElementById("assign-groups-candidate-group-1")).not.toBeNull();
      expect(document.getElementById("assign-groups-candidate-proc-proc-1")).toBeNull();
    });

    it("defaults to the procedure scope when the fund-filtered group scope is empty and procedure candidates exist (no-bordereau case)", () => {
      const line = makeNeedsGroupLine({
        candidate_groups: [],
        candidate_procedures: [PROCEDURE_CANDIDATE_1],
      });

      render(<AssignGroupsModal line={line} isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);

      expect(
        document.getElementById("assign-groups-scope-procedures")?.getAttribute("aria-pressed"),
      ).toBe("true");
      expect(document.getElementById("assign-groups-candidate-proc-proc-1")).not.toBeNull();
    });

    it("reopens on the procedure scope with assigned procedures pre-checked", () => {
      const line = makeNeedsGroupLine({
        status: "Partial",
        assigned_procedure_ids: ["proc-1"],
        covered_amount: 60000,
        // Group candidates are non-empty too — the seeding rule takes
        // precedence over the "empty group scope" default rule.
        candidate_groups: [CANDIDATE_EXACT],
        candidate_procedures: [PROCEDURE_CANDIDATE_1, PROCEDURE_CANDIDATE_2],
      });

      render(<AssignGroupsModal line={line} isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);

      expect(
        document.getElementById("assign-groups-scope-procedures")?.getAttribute("aria-pressed"),
      ).toBe("true");
      const seeded = document.getElementById("assign-groups-check-proc-proc-1") as HTMLInputElement;
      expect(seeded?.checked).toBe(true);
      const other = document.getElementById("assign-groups-check-proc-proc-2") as HTMLInputElement;
      expect(other?.checked).toBe(false);
    });

    it("clears the selection when switching from the fund scope to the procedure scope and back", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      const line = makeNeedsGroupLine({ candidate_procedures: [PROCEDURE_CANDIDATE_1] });

      render(
        <AssignGroupsModal line={line} isOpen={true} onSubmit={onSubmit} onCancel={vi.fn()} />,
      );

      const groupCheck = document.getElementById("assign-groups-check-group-1");
      if (!groupCheck) throw new Error("group checkbox missing");
      await user.click(groupCheck);

      const procScope = document.getElementById("assign-groups-scope-procedures");
      if (!procScope) throw new Error("procedure scope control missing");
      await user.click(procScope);

      const fundScope = document.getElementById("assign-groups-scope-fund");
      if (!fundScope) throw new Error("fund scope control missing");
      await user.click(fundScope);

      const submitBtn = document.getElementById("assign-groups-submit");
      if (!submitBtn) throw new Error("submit button missing");
      await user.click(submitBtn);

      // Selection made before switching away must not silently survive.
      expect(onSubmit).toHaveBeenCalledWith({
        type: "AssignGroups",
        line_id: "line-needs-group",
        group_ids: [],
      });
    });
  });

  // ---------------------------------------------------------------------------
  // BAS-113 — AssignProcedures submit branch
  // ---------------------------------------------------------------------------

  describe("BAS-113 — procedure assignment", () => {
    it("renders procedure candidates with patient name, date, and billed amount in the procedure scope", async () => {
      const user = userEvent.setup();
      const line = makeNeedsGroupLine({
        candidate_procedures: [PROCEDURE_CANDIDATE_1, PROCEDURE_CANDIDATE_2],
      });

      render(<AssignGroupsModal line={line} isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);

      const procScope = document.getElementById("assign-groups-scope-procedures");
      if (!procScope) throw new Error("procedure scope control missing");
      await user.click(procScope);

      const row1 = document.getElementById("assign-groups-candidate-proc-proc-1");
      expect(row1).not.toBeNull();
      expect(row1?.textContent).toContain("Jean Dupont");

      const row2 = document.getElementById("assign-groups-candidate-proc-proc-2");
      expect(row2).not.toBeNull();
      expect(row2?.textContent).toContain("Marie Curie");
    });

    it("submits an AssignProcedures correction when procedures are selected in the procedure scope (BAS-113)", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      const line = makeNeedsGroupLine({
        candidate_procedures: [PROCEDURE_CANDIDATE_1, PROCEDURE_CANDIDATE_2],
      });

      render(
        <AssignGroupsModal line={line} isOpen={true} onSubmit={onSubmit} onCancel={vi.fn()} />,
      );

      const procScope = document.getElementById("assign-groups-scope-procedures");
      if (!procScope) throw new Error("procedure scope control missing");
      await user.click(procScope);

      const check1 = document.getElementById("assign-groups-check-proc-proc-1");
      if (!check1) throw new Error("procedure checkbox missing");
      await user.click(check1);

      const submitBtn = document.getElementById("assign-groups-submit");
      if (!submitBtn) throw new Error("submit button missing");
      await user.click(submitBtn);

      expect(onSubmit).toHaveBeenCalledWith({
        type: "AssignProcedures",
        line_id: "line-needs-group",
        procedure_ids: ["proc-1"],
      });
    });

    it("flags the exact-amount procedure candidate", async () => {
      const user = userEvent.setup();
      const exactProc: BankStatementProcedureCandidate = {
        ...PROCEDURE_CANDIDATE_1,
        is_exact_amount: true,
      };
      const line = makeNeedsGroupLine({ candidate_procedures: [exactProc, PROCEDURE_CANDIDATE_2] });

      render(<AssignGroupsModal line={line} isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);

      const procScope = document.getElementById("assign-groups-scope-procedures");
      if (!procScope) throw new Error("procedure scope control missing");
      await user.click(procScope);

      expect(document.getElementById("assign-groups-exact-proc-proc-1")).not.toBeNull();
      expect(document.getElementById("assign-groups-exact-proc-proc-2")).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Dialog actions (2026-07-31 wireframe review) — three-action footer
  // ---------------------------------------------------------------------------

  describe("Dialog actions — three-action footer", () => {
    it("disables the with-remainder action when nothing is selected", () => {
      const line = makeNeedsGroupLine();

      render(<AssignGroupsModal line={line} isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);

      const withRemainder = document.getElementById(
        "assign-groups-submit-with-remainder",
      ) as HTMLButtonElement | null;
      expect(withRemainder).not.toBeNull();
      expect(withRemainder?.disabled).toBe(true);
    });

    it("disables the with-remainder action when the selection fully covers the line amount", async () => {
      const user = userEvent.setup();
      const line = makeNeedsGroupLine();

      render(<AssignGroupsModal line={line} isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);

      // CANDIDATE_EXACT (150000) exactly covers the 150000 line amount — no
      // remainder, so "with remainder" must stay disabled.
      const exactCheck = document.getElementById("assign-groups-check-group-1");
      if (!exactCheck) throw new Error("candidate checkbox missing");
      await user.click(exactCheck);

      const withRemainder = document.getElementById(
        "assign-groups-submit-with-remainder",
      ) as HTMLButtonElement | null;
      expect(withRemainder?.disabled).toBe(true);
    });

    it("enables the with-remainder action when the selection is non-empty and leaves a remainder", async () => {
      const user = userEvent.setup();
      const line = makeNeedsGroupLine();

      render(<AssignGroupsModal line={line} isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);

      // CANDIDATE_PARTIAL (80000) is below the 150000 line amount.
      const partialCheck = document.getElementById("assign-groups-check-group-2");
      if (!partialCheck) throw new Error("candidate checkbox missing");
      await user.click(partialCheck);

      const withRemainder = document.getElementById(
        "assign-groups-submit-with-remainder",
      ) as HTMLButtonElement | null;
      expect(withRemainder?.disabled).toBe(false);
    });

    it("submits the group assignment then acknowledges the remainder in one click (BAS-113 dialog actions)", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      const line = makeNeedsGroupLine();

      render(
        <AssignGroupsModal line={line} isOpen={true} onSubmit={onSubmit} onCancel={vi.fn()} />,
      );

      const partialCheck = document.getElementById("assign-groups-check-group-2");
      if (!partialCheck) throw new Error("candidate checkbox missing");
      await user.click(partialCheck);

      const withRemainder = document.getElementById("assign-groups-submit-with-remainder");
      if (!withRemainder) throw new Error("with-remainder button missing");
      await user.click(withRemainder);

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));

      const calls = onSubmit.mock.calls.map((call) => call[0] as BankStatementCorrection);
      expect(calls[0]).toEqual({
        type: "AssignGroups",
        line_id: "line-needs-group",
        group_ids: ["group-2"],
      });
      expect(calls[1]).toEqual({ type: "AcknowledgeRemainder", line_id: "line-needs-group" });
    });

    it("does not acknowledge the remainder when the assignment correction is rejected (BAS-064)", async () => {
      const user = userEvent.setup();
      // The host resolves false when the correction was rejected — the
      // composition must bail instead of acknowledging against the unchanged
      // prior draft.
      const onSubmit = vi.fn().mockResolvedValue(false);
      const line = makeNeedsGroupLine();

      render(
        <AssignGroupsModal line={line} isOpen={true} onSubmit={onSubmit} onCancel={vi.fn()} />,
      );

      const partialCheck = document.getElementById("assign-groups-check-group-2");
      if (!partialCheck) throw new Error("candidate checkbox missing");
      await user.click(partialCheck);

      const withRemainder = document.getElementById("assign-groups-submit-with-remainder");
      if (!withRemainder) throw new Error("with-remainder button missing");
      await user.click(withRemainder);

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit.mock.calls[0]?.[0]).toEqual({
        type: "AssignGroups",
        line_id: "line-needs-group",
        group_ids: ["group-2"],
      });
    });

    it("submits the procedure assignment then acknowledges the remainder in one click (BAS-113 dialog actions)", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      const line = makeNeedsGroupLine({
        candidate_procedures: [PROCEDURE_CANDIDATE_1, PROCEDURE_CANDIDATE_2],
      });

      render(
        <AssignGroupsModal line={line} isOpen={true} onSubmit={onSubmit} onCancel={vi.fn()} />,
      );

      const procScope = document.getElementById("assign-groups-scope-procedures");
      if (!procScope) throw new Error("procedure scope control missing");
      await user.click(procScope);

      const check1 = document.getElementById("assign-groups-check-proc-proc-1");
      if (!check1) throw new Error("procedure checkbox missing");
      await user.click(check1);

      const withRemainder = document.getElementById("assign-groups-submit-with-remainder");
      if (!withRemainder) throw new Error("with-remainder button missing");
      await user.click(withRemainder);

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));

      const calls = onSubmit.mock.calls.map((call) => call[0] as BankStatementCorrection);
      expect(calls[0]).toEqual({
        type: "AssignProcedures",
        line_id: "line-needs-group",
        procedure_ids: ["proc-1"],
      });
      expect(calls[1]).toEqual({ type: "AcknowledgeRemainder", line_id: "line-needs-group" });
    });
  });

  // ---------------------------------------------------------------------------
  // BAS-117 — procedure-path scope cuts (negative assertions)
  // ---------------------------------------------------------------------------

  describe("BAS-117 — procedure-path scope cuts", () => {
    it("offers no per-procedure amount input in the procedure scope", async () => {
      const user = userEvent.setup();
      const line = makeNeedsGroupLine({
        candidate_procedures: [PROCEDURE_CANDIDATE_1, PROCEDURE_CANDIDATE_2],
      });

      render(<AssignGroupsModal line={line} isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);

      const procScope = document.getElementById("assign-groups-scope-procedures");
      if (!procScope) throw new Error("procedure scope control missing");
      await user.click(procScope);

      expect(document.querySelectorAll('input[type="number"]').length).toBe(0);
    });

    it("offers no patient/procedure creation or dispute affordance in the procedure scope", async () => {
      const user = userEvent.setup();
      const line = makeNeedsGroupLine({
        candidate_procedures: [PROCEDURE_CANDIDATE_1, PROCEDURE_CANDIDATE_2],
      });

      render(<AssignGroupsModal line={line} isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);

      const procScope = document.getElementById("assign-groups-scope-procedures");
      if (!procScope) throw new Error("procedure scope control missing");
      await user.click(procScope);

      const allIds = Array.from(document.querySelectorAll("[id]")).map((el) => el.id);
      expect(allIds.some((id) => /create-patient|create-procedure|dispute|contest/.test(id))).toBe(
        false,
      );
    });
  });
});
