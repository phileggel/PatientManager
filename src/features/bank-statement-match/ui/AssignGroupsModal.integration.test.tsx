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
    const candidateRow1 = document.getElementById("bank-statement-assign-groups-candidate-group-1");
    const candidateRow2 = document.getElementById("bank-statement-assign-groups-candidate-group-2");
    expect(candidateRow1).not.toBeNull();
    expect(candidateRow2).not.toBeNull();

    // Each row names its bordereau by date — the line's fund only (BAS-090A)
    expect(candidateRow1?.textContent).toContain("reconciliation.assign_groups.bordereau");

    // The wire order (backend: most recent payment first) renders as-is —
    // no client-side re-sort.
    const allRows = document.querySelectorAll("[id^='bank-statement-assign-groups-candidate-']");
    expect(allRows[0]?.id).toBe("bank-statement-assign-groups-candidate-group-1");
    expect(allRows[1]?.id).toBe("bank-statement-assign-groups-candidate-group-2");

    // The exact-amount candidate carries the flag; the partial one does not.
    expect(document.getElementById("bank-statement-assign-groups-exact-group-1")).not.toBeNull();
    expect(document.getElementById("bank-statement-assign-groups-exact-group-2")).toBeNull();
  });

  // BAS-110 — the assign dialog mounts the correction context header.
  it("mounts the context header showing the bank line being corrected (BAS-110)", () => {
    const line = makeNeedsGroupLine();

    render(<AssignGroupsModal line={line} isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);

    const header = document.getElementById("bank-statement-assign-groups-context");
    expect(header).not.toBeNull();
    expect(header?.textContent).toContain("CPAM75");
  });

  // BAS-090 — selecting a group and submitting produces AssignGroups correction
  it("calls onSubmit with AssignGroups correction containing selected group id (BAS-090)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const line = makeNeedsGroupLine();

    render(<AssignGroupsModal line={line} isOpen={true} onSubmit={onSubmit} onCancel={vi.fn()} />);

    // Select group-1 via its checkbox/row
    const checkbox = document.getElementById("bank-statement-assign-groups-check-group-1");
    expect(checkbox).not.toBeNull();
    if (!checkbox) throw new Error("candidate checkbox missing");

    await user.click(checkbox);

    const submitBtn = document.getElementById("bank-statement-assign-groups-submit");
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

    const balanceEl = document.getElementById("bank-statement-assign-groups-balance");
    expect(balanceEl).not.toBeNull();

    // Initially covered_amount=0 (no selection); the balance element exists
    expect(balanceEl?.textContent).toBeTruthy();

    // Select the partial group — balance should reflect 80000 covered
    const checkbox = document.getElementById("bank-statement-assign-groups-check-group-2");
    if (!checkbox) throw new Error("candidate checkbox missing");
    await user.click(checkbox);

    // Balance element still present and updated (exact text is i18n-formatted, so
    // we assert presence + that the element now includes "80" somewhere — the
    // currency formatter will output something containing this amount)
    const updatedBalance = document.getElementById("bank-statement-assign-groups-balance");
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
    const cb1 = document.getElementById("bank-statement-assign-groups-check-group-2");
    const cb2 = document.getElementById("bank-statement-assign-groups-check-group-3");
    if (!cb1 || !cb2) throw new Error("candidate checkboxes missing");

    await user.click(cb1);
    await user.click(cb2);

    const submitBtn = document.getElementById(
      "bank-statement-assign-groups-submit",
    ) as HTMLButtonElement | null;
    expect(submitBtn).not.toBeNull();
    expect(submitBtn?.disabled).toBe(true);
  });

  // BAS-062 override — the seeded assignment can be unchecked and submitted
  // empty (explicit unassign).
  it("keeps the primary action off once the seeded assignment is unchecked (#697)", async () => {
    const user = userEvent.setup();
    const line = makeNeedsGroupLine({
      status: "Matched",
      assigned_group_ids: ["group-1"],
      covered_amount: 150000,
    });

    render(<AssignGroupsModal line={line} isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);

    const seeded = document.getElementById(
      "bank-statement-assign-groups-check-group-1",
    ) as HTMLInputElement;
    expect(seeded?.checked).toBe(true);
    await user.click(seeded);

    expect(
      (document.getElementById("bank-statement-assign-groups-submit") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  // BAS-090 (#695, owner 2026-11-15) — no cross-fund match: the dialog offers
  // the line's fund only, with no all-funds scope.
  it("offers no all-funds scope (BAS-090)", () => {
    render(
      <AssignGroupsModal
        line={makeNeedsGroupLine()}
        isOpen={true}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(document.getElementById("bank-statement-assign-groups-scope-fund")).not.toBeNull();
    expect(document.getElementById("bank-statement-assign-groups-scope-all")).toBeNull();
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

    const seeded = document.getElementById(
      "bank-statement-assign-groups-check-group-2",
    ) as HTMLInputElement;
    expect(seeded?.checked).toBe(true);
    const other = document.getElementById(
      "bank-statement-assign-groups-check-group-1",
    ) as HTMLInputElement;
    expect(other?.checked).toBe(false);
    // The former standalone acknowledge affordance is removed (2026-07-31
    // wireframe review) — the remainder is informational text only, and
    // acknowledging happens via the "Rapprocher avec reliquat" footer action.
    expect(
      document.getElementById("bank-statement-assign-groups-acknowledge-remainder"),
    ).toBeNull();
    expect(document.getElementById("bank-statement-assign-groups-remainder-info")).not.toBeNull();
  });

  // BAS-090 — unchecking a selected candidate removes it from the submission.
  it("deselects a candidate on second click, leaving nothing to submit", async () => {
    const user = userEvent.setup();
    const line = makeNeedsGroupLine();

    render(<AssignGroupsModal line={line} isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);

    const check = document.getElementById(
      "bank-statement-assign-groups-check-group-1",
    ) as HTMLInputElement;
    await user.click(check);
    await user.click(check);

    expect(check.checked).toBe(false);
    expect(
      (document.getElementById("bank-statement-assign-groups-submit") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("calls onCancel and does not call onSubmit when cancel is clicked", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const line = makeNeedsGroupLine();

    render(<AssignGroupsModal line={line} isOpen={true} onSubmit={onSubmit} onCancel={onCancel} />);

    const cancelBtn = document.getElementById("bank-statement-assign-groups-cancel");
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
    it("offers both scopes for a linked line with group AND procedure candidates", () => {
      const line = makeNeedsGroupLine({ candidate_procedures: [PROCEDURE_CANDIDATE_1] });

      render(<AssignGroupsModal line={line} isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);

      expect(document.getElementById("bank-statement-assign-groups-scope-fund")).not.toBeNull();
      expect(
        document.getElementById("bank-statement-assign-groups-scope-procedures"),
      ).not.toBeNull();
    });

    it("does not offer the procedure scope when the line's fund is unknown (rejected/unlinked label)", () => {
      const line = makeNeedsGroupLine({
        status: "Rejected",
        fund_id: null,
        candidate_groups: [],
        candidate_procedures: [PROCEDURE_CANDIDATE_1],
      });

      render(<AssignGroupsModal line={line} isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);

      expect(document.getElementById("bank-statement-assign-groups-scope-procedures")).toBeNull();
    });

    it("defaults to the fund-filtered group scope when group candidates exist", () => {
      const line = makeNeedsGroupLine({ candidate_procedures: [PROCEDURE_CANDIDATE_1] });

      render(<AssignGroupsModal line={line} isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);

      expect(
        document
          .getElementById("bank-statement-assign-groups-scope-fund")
          ?.getAttribute("aria-pressed"),
      ).toBe("true");
      // Group candidates render immediately, procedure candidates do not.
      expect(
        document.getElementById("bank-statement-assign-groups-candidate-group-1"),
      ).not.toBeNull();
      expect(
        document.getElementById("bank-statement-assign-groups-candidate-proc-proc-1"),
      ).toBeNull();
    });

    it("defaults to the procedure scope when the fund-filtered group scope is empty and procedure candidates exist (no-bordereau case)", () => {
      const line = makeNeedsGroupLine({
        candidate_groups: [],
        candidate_procedures: [PROCEDURE_CANDIDATE_1],
      });

      render(<AssignGroupsModal line={line} isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);

      expect(
        document
          .getElementById("bank-statement-assign-groups-scope-procedures")
          ?.getAttribute("aria-pressed"),
      ).toBe("true");
      expect(
        document.getElementById("bank-statement-assign-groups-candidate-proc-proc-1"),
      ).not.toBeNull();
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
        document
          .getElementById("bank-statement-assign-groups-scope-procedures")
          ?.getAttribute("aria-pressed"),
      ).toBe("true");
      const seeded = document.getElementById(
        "bank-statement-assign-groups-check-proc-proc-1",
      ) as HTMLInputElement;
      expect(seeded?.checked).toBe(true);
      const other = document.getElementById(
        "bank-statement-assign-groups-check-proc-proc-2",
      ) as HTMLInputElement;
      expect(other?.checked).toBe(false);
    });

    it("clears the selection when switching from the fund scope to the procedure scope and back", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      const line = makeNeedsGroupLine({ candidate_procedures: [PROCEDURE_CANDIDATE_1] });

      render(
        <AssignGroupsModal line={line} isOpen={true} onSubmit={onSubmit} onCancel={vi.fn()} />,
      );

      const groupCheck = document.getElementById("bank-statement-assign-groups-check-group-1");
      if (!groupCheck) throw new Error("group checkbox missing");
      await user.click(groupCheck);

      const procScope = document.getElementById("bank-statement-assign-groups-scope-procedures");
      if (!procScope) throw new Error("procedure scope control missing");
      await user.click(procScope);

      const fundScope = document.getElementById("bank-statement-assign-groups-scope-fund");
      if (!fundScope) throw new Error("fund scope control missing");
      await user.click(fundScope);

      // Selection made before switching away must not silently survive.
      expect(
        (document.getElementById("bank-statement-assign-groups-check-group-1") as HTMLInputElement)
          .checked,
      ).toBe(false);
      expect(
        (document.getElementById("bank-statement-assign-groups-submit") as HTMLButtonElement)
          .disabled,
      ).toBe(true);
      expect(onSubmit).not.toHaveBeenCalled();
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

      const procScope = document.getElementById("bank-statement-assign-groups-scope-procedures");
      if (!procScope) throw new Error("procedure scope control missing");
      await user.click(procScope);

      const row1 = document.getElementById("bank-statement-assign-groups-candidate-proc-proc-1");
      expect(row1).not.toBeNull();
      expect(row1?.textContent).toContain("Jean Dupont");

      const row2 = document.getElementById("bank-statement-assign-groups-candidate-proc-proc-2");
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

      const procScope = document.getElementById("bank-statement-assign-groups-scope-procedures");
      if (!procScope) throw new Error("procedure scope control missing");
      await user.click(procScope);

      const check1 = document.getElementById("bank-statement-assign-groups-check-proc-proc-1");
      if (!check1) throw new Error("procedure checkbox missing");
      await user.click(check1);

      const submitBtn = document.getElementById("bank-statement-assign-groups-submit");
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

      const procScope = document.getElementById("bank-statement-assign-groups-scope-procedures");
      if (!procScope) throw new Error("procedure scope control missing");
      await user.click(procScope);

      expect(
        document.getElementById("bank-statement-assign-groups-exact-proc-proc-1"),
      ).not.toBeNull();
      expect(document.getElementById("bank-statement-assign-groups-exact-proc-proc-2")).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Dialog actions (2026-07-31 wireframe review) — three-action footer
  // ---------------------------------------------------------------------------

  describe("#697 — the footer: « Laisser de côté », « Annuler », one filled action", () => {
    it("keeps the filled action off while nothing is ticked", () => {
      render(
        <AssignGroupsModal
          line={makeNeedsGroupLine()}
          isOpen={true}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      const submit = document.getElementById(
        "bank-statement-assign-groups-submit",
      ) as HTMLButtonElement;
      expect(submit.disabled).toBe(true);
      expect(submit.textContent).toContain("reconciliation.assign_groups.submit");
    });

    it("at exact coverage submits the assignment alone, the bar green", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <AssignGroupsModal
          line={makeNeedsGroupLine()}
          isOpen={true}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />,
      );

      const exact = document.getElementById("bank-statement-assign-groups-check-group-1");
      if (!exact) throw new Error("candidate checkbox missing");
      await user.click(exact);
      expect(document.getElementById("bank-statement-assign-groups-cover-bar")?.dataset.tone).toBe(
        "exact",
      );
      expect(document.getElementById("bank-statement-assign-groups-remainder-info")).toBeNull();

      await user.click(
        document.getElementById("bank-statement-assign-groups-submit") as HTMLElement,
      );

      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith({
        type: "AssignGroups",
        line_id: "line-needs-group",
        group_ids: ["group-1"],
      });
    });

    it("short of the amount, states the reliquat and submits « avec reliquat »: the assignment, then the acknowledgment", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <AssignGroupsModal
          line={makeNeedsGroupLine()}
          isOpen={true}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />,
      );

      const partial = document.getElementById("bank-statement-assign-groups-check-group-2");
      if (!partial) throw new Error("candidate checkbox missing");
      await user.click(partial);
      expect(document.getElementById("bank-statement-assign-groups-cover-bar")?.dataset.tone).toBe(
        "short",
      );
      expect(document.getElementById("bank-statement-assign-groups-remainder-info")).not.toBeNull();
      const submit = document.getElementById(
        "bank-statement-assign-groups-submit",
      ) as HTMLButtonElement;
      expect(submit.textContent).toContain("reconciliation.assign_groups.submit_with_remainder");

      await user.click(submit);

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
      const calls = onSubmit.mock.calls.map((call) => call[0] as BankStatementCorrection);
      expect(calls[0]).toEqual({
        type: "AssignGroups",
        line_id: "line-needs-group",
        group_ids: ["group-2"],
      });
      expect(calls[1]).toEqual({ type: "AcknowledgeRemainder", line_id: "line-needs-group" });
    });

    it("above the amount, says so in red and keeps the action off (BAS-094)", async () => {
      const user = userEvent.setup();
      render(
        <AssignGroupsModal
          line={makeNeedsGroupLine()}
          isOpen={true}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      await user.click(
        document.getElementById("bank-statement-assign-groups-check-group-1") as HTMLElement,
      );
      await user.click(
        document.getElementById("bank-statement-assign-groups-check-group-2") as HTMLElement,
      );

      expect(document.getElementById("bank-statement-assign-groups-cover-bar")?.dataset.tone).toBe(
        "over",
      );
      expect(document.getElementById("bank-statement-assign-groups-overflow-info")).not.toBeNull();
      expect(document.getElementById("bank-statement-assign-groups-remainder-info")).toBeNull();
      expect(
        (document.getElementById("bank-statement-assign-groups-submit") as HTMLButtonElement)
          .disabled,
      ).toBe(true);
    });

    it("says when the fund has no open payment group (#357)", () => {
      render(
        <AssignGroupsModal
          line={makeNeedsGroupLine({ candidate_groups: [] })}
          isOpen={true}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      expect(document.getElementById("bank-statement-assign-groups-groups-empty")).not.toBeNull();
    });

    it("does not acknowledge the remainder when the assignment is rejected (BAS-064)", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(false);
      render(
        <AssignGroupsModal
          line={makeNeedsGroupLine()}
          isOpen={true}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />,
      );

      await user.click(
        document.getElementById("bank-statement-assign-groups-check-group-2") as HTMLElement,
      );
      await user.click(
        document.getElementById("bank-statement-assign-groups-submit") as HTMLElement,
      );

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    });

    it("leaves the line aside: an empty assignment of the current scope, then the acknowledgment (BAS-123B)", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <AssignGroupsModal
          line={makeNeedsGroupLine()}
          isOpen={true}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />,
      );

      await user.click(
        document.getElementById("bank-statement-assign-groups-leave-aside") as HTMLElement,
      );

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
      const calls = onSubmit.mock.calls.map((call) => call[0] as BankStatementCorrection);
      expect(calls[0]).toEqual({
        type: "AssignGroups",
        line_id: "line-needs-group",
        group_ids: [],
      });
      expect(calls[1]).toEqual({ type: "AcknowledgeRemainder", line_id: "line-needs-group" });
    });
  });

  // ---------------------------------------------------------------------------

  describe("BAS-117 — procedure-path scope cuts", () => {
    it("offers no per-procedure amount input in the procedure scope", async () => {
      const user = userEvent.setup();
      const line = makeNeedsGroupLine({
        candidate_procedures: [PROCEDURE_CANDIDATE_1, PROCEDURE_CANDIDATE_2],
      });

      render(<AssignGroupsModal line={line} isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);

      const procScope = document.getElementById("bank-statement-assign-groups-scope-procedures");
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

      const procScope = document.getElementById("bank-statement-assign-groups-scope-procedures");
      if (!procScope) throw new Error("procedure scope control missing");
      await user.click(procScope);

      const allIds = Array.from(document.querySelectorAll("[id]")).map((el) => el.id);
      expect(allIds.some((id) => /create-patient|create-procedure|dispute|contest/.test(id))).toBe(
        false,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // BAS-119 — the candidate zone is the only scrollable area in the dialog.
  // Cheap structural check only; the rest is visual proof.
  // ---------------------------------------------------------------------------

  describe("BAS-119 — scrollable candidate zone", () => {
    it("wraps the candidate list in a dedicated scrollable region", () => {
      const line = makeNeedsGroupLine();

      render(<AssignGroupsModal line={line} isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);

      const scrollzone = document.getElementById("bank-statement-assign-groups-scrollzone");
      expect(scrollzone).not.toBeNull();
      expect(scrollzone?.className).toContain("overflow-y-auto");
      expect(
        scrollzone?.contains(
          document.getElementById("bank-statement-assign-groups-candidate-group-1"),
        ),
      ).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // BAS-123A — leaving a line aside (empty-selection gold action)
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------

  describe("BAS-118/118A — procedure display window", () => {
    const NOW = new Date("2026-05-01T00:00:00.000Z");

    it("shows the windowed empty state with a show-older override when every procedure is older than the window", async () => {
      const user = userEvent.setup();
      const oldProcedure: BankStatementProcedureCandidate = {
        ...PROCEDURE_CANDIDATE_1,
        procedure_id: "proc-old",
        procedure_date: "2025-11-01",
      };
      const line = makeNeedsGroupLine({
        candidate_groups: [],
        candidate_procedures: [oldProcedure],
      });

      render(
        <AssignGroupsModal
          line={line}
          isOpen={true}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          procedureWindowDays={90}
          now={NOW}
        />,
      );

      // Default scope evaluates the UNFILTERED pool (BAS-118A) — the dialog
      // opens on the procedure scope even though the filtered list is empty.
      expect(
        document
          .getElementById("bank-statement-assign-groups-scope-procedures")
          ?.getAttribute("aria-pressed"),
      ).toBe("true");
      expect(
        document.getElementById("bank-statement-assign-groups-candidate-proc-proc-old"),
      ).toBeNull();
      expect(
        document.getElementById("bank-statement-assign-groups-procedures-windowed-empty"),
      ).not.toBeNull();

      const showOlder = document.getElementById("bank-statement-assign-groups-show-older");
      if (!showOlder) throw new Error("show-older override missing");
      await user.click(showOlder);

      // The override reveals the full pool for this dialog instance only.
      expect(
        document.getElementById("bank-statement-assign-groups-candidate-proc-proc-old"),
      ).not.toBeNull();
    });

    it("filters the procedure list by the window while keeping in-window candidates", () => {
      const recent: BankStatementProcedureCandidate = {
        ...PROCEDURE_CANDIDATE_1,
        procedure_id: "proc-recent",
        procedure_date: "2026-04-20",
      };
      const old: BankStatementProcedureCandidate = {
        ...PROCEDURE_CANDIDATE_2,
        procedure_id: "proc-old",
        procedure_date: "2025-11-01",
      };
      const line = makeNeedsGroupLine({
        candidate_groups: [],
        candidate_procedures: [recent, old],
      });

      render(
        <AssignGroupsModal
          line={line}
          isOpen={true}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          procedureWindowDays={90}
          now={NOW}
        />,
      );

      expect(
        document.getElementById("bank-statement-assign-groups-candidate-proc-proc-recent"),
      ).not.toBeNull();
      expect(
        document.getElementById("bank-statement-assign-groups-candidate-proc-proc-old"),
      ).toBeNull();
    });
  });
});
