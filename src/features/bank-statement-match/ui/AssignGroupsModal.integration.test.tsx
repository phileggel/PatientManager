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

import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BankStatementCandidate, BankStatementLine } from "@/bindings";

vi.mock("../gateway", () => ({
  computeBankStatementReconciliation: vi.fn(),
  validateBankStatementReconciliation: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
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

function makeNeedsGroupLine(overrides: Partial<BankStatementLine> = {}): BankStatementLine {
  return {
    line_id: "line-needs-group",
    credit_line: { date: "2026-04-10", label: "CPAM75", amount: 150000 },
    status: "NeedsGroup",
    fund_id: "fund-1",
    assigned_group_ids: [],
    covered_amount: 0,
    remainder_acknowledged: false,
    candidate_groups: [CANDIDATE_EXACT, CANDIDATE_PARTIAL],
    broadened_candidates: [],
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
  it("renders candidate groups with stable ids, exact-match group first (BAS-068)", () => {
    const line = makeNeedsGroupLine();

    render(<AssignGroupsModal line={line} isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);

    // Each candidate has a stable row id
    const candidateRow1 = document.getElementById("assign-groups-candidate-group-1");
    const candidateRow2 = document.getElementById("assign-groups-candidate-group-2");
    expect(candidateRow1).not.toBeNull();
    expect(candidateRow2).not.toBeNull();

    // Each row identifies its fund by name (BAS-068)
    expect(candidateRow1?.textContent).toContain("CPAM Paris");

    // Exact-amount candidate appears before the partial candidate in DOM order
    const allRows = document.querySelectorAll("[id^='assign-groups-candidate-']");
    expect(allRows[0]?.id).toBe("assign-groups-candidate-group-1");
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

  // BAS-062 override — submitting empty group_ids (unassign) is valid
  it("calls onSubmit with empty group_ids when no groups selected (unassign override, BAS-062)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    // A line that already has an assignment — user opens it to unassign
    const line = makeNeedsGroupLine({
      status: "Matched",
      assigned_group_ids: ["group-1"],
      covered_amount: 150000,
    });

    render(<AssignGroupsModal line={line} isOpen={true} onSubmit={onSubmit} onCancel={vi.fn()} />);

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

  // BAS-068 — the broaden toggle swaps the fund-filtered set for the fund-agnostic
  // superset, revealing a candidate from a different fund not in the default list.
  it("reveals a different-fund candidate when the broaden toggle is on (BAS-068)", async () => {
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

    // Default (fund-filtered): the other-fund candidate is NOT shown.
    expect(document.getElementById("assign-groups-candidate-group-other-fund")).toBeNull();

    const broadenBtn = document.getElementById("assign-groups-broaden");
    expect(broadenBtn).not.toBeNull();
    if (!broadenBtn) throw new Error("broaden toggle missing");

    await user.click(broadenBtn);

    // Broadened: the other-fund candidate now appears.
    expect(document.getElementById("assign-groups-candidate-group-other-fund")).not.toBeNull();

    // Toggling off restores the fund-filtered set.
    await user.click(broadenBtn);
    expect(document.getElementById("assign-groups-candidate-group-other-fund")).toBeNull();
  });

  // A selection made in the broadened set must not survive invisibly after the
  // user narrows back — submit must only carry visible selections.
  it("drops a broadened-only selection when the broaden toggle is turned off", async () => {
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

    const broadenBtn = document.getElementById("assign-groups-broaden");
    if (!broadenBtn) throw new Error("broaden toggle missing");

    // Broaden, select the other-fund candidate, then narrow back.
    await user.click(broadenBtn);
    const otherFundCheck = document.getElementById("assign-groups-check-group-other-fund");
    if (!otherFundCheck) throw new Error("broadened candidate checkbox missing");
    await user.click(otherFundCheck);
    await user.click(broadenBtn);

    const submitBtn = document.getElementById("assign-groups-submit");
    if (!submitBtn) throw new Error("submit button missing");
    await user.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledWith({
      type: "AssignGroups",
      line_id: "line-needs-group",
      group_ids: [],
    });
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
});
