/**
 * RTL component integration tests — ReconciliationView (BAS-060–069/090–094/100–103).
 *
 * ReconciliationView is the live reconciliation phase mounted once the gate has
 * resolved parseResult + bankAccount (BAS-011–017). It drives:
 *
 *   - Loading state while useBankStatementReconciliation has not yet computed (line 62)
 *   - The reconciliation list + per-line correction modals on double-click (BAS-062):
 *       NeedsLink  → LinkFundModal
 *       Partial    → RemainderModal
 *       NeedsGroup / Unresolved / Matched / Rejected → AssignGroupsModal
 *   - applyCorrection called from a modal + modal closes afterwards (BAS-064)
 *   - Wizard button → ReconciliationWizard; apply/abandon/complete paths (BAS-100–103)
 *   - Validate button → validate() → done/summary state on success (BAS-093)
 *   - Validate error → typed error surfaced via presenter + t() (F27)
 *   - isBusy state disables buttons (BAS-064)
 *   - Error render via presentReconciliationError → t() (F27)
 *
 * Mocks the gateway at the feature boundary (F3/F27); useBankStatementReconciliation
 * calls gateway.computeBankStatementReconciliation + gateway.validateBankStatementReconciliation.
 * Stable id selectors (F25). i18n via mock (key → key passthrough).
 */

import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BankStatementLine,
  BankStatementParseResult,
  BankStatementReconciliation,
} from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";

// ---------------------------------------------------------------------------
// Mock gateway boundary (F3). Must be before component + hook imports.
// ---------------------------------------------------------------------------

vi.mock("../gateway", () => ({
  parseBankStatement: vi.fn(),
  resolveBankAccountFromIban: vi.fn(),
  createBankAccount: vi.fn(),
  computeBankStatementReconciliation: vi.fn(),
  validateBankStatementReconciliation: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}));

import * as gateway from "../gateway";
import { ReconciliationView } from "./ReconciliationView";

const mockCompute = vi.mocked(gateway.computeBankStatementReconciliation);
const mockValidate = vi.mocked(gateway.validateBankStatementReconciliation);

// ---------------------------------------------------------------------------
// Fixtures — stable references (F19 / test_convention.md)
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

function makeLine(overrides: Partial<BankStatementLine>): BankStatementLine {
  return {
    line_id: "line-1",
    credit_line: { date: "2026-04-10", label: "CPAM75", amount: 150000 },
    status: "Matched",
    fund_id: "fund-1",
    assigned_group_ids: ["group-1"],
    covered_amount: 150000,
    remainder_acknowledged: false,
    candidate_groups: [],
    suggested_fund_id: null,
    suggested_fund_name: null,
    ...overrides,
  };
}

function makeReconciliation(
  lines: BankStatementLine[],
  overrides: Partial<BankStatementReconciliation> = {},
): BankStatementReconciliation {
  return {
    lines,
    resolved_count: lines.filter((l) => l.status === "Matched" || l.status === "Rejected").length,
    needs_correction_count: lines.filter((l) => l.status !== "Matched" && l.status !== "Rejected")
      .length,
    ...overrides,
  };
}

const NEEDS_LINK_LINE = makeLine({
  line_id: "line-needs-link",
  credit_line: { date: "2026-04-11", label: "MGEN", amount: 75000 },
  status: "NeedsLink",
  fund_id: null,
  assigned_group_ids: [],
  covered_amount: 0,
});

const NEEDS_GROUP_LINE = makeLine({
  line_id: "line-needs-group",
  status: "NeedsGroup",
  fund_id: "fund-1",
  assigned_group_ids: [],
  covered_amount: 0,
  candidate_groups: [
    {
      group_id: "group-1",
      fund_id: "fund-1",
      payment_date: "2026-04-08",
      total_amount: 150000,
      is_exact_amount: true,
    },
  ],
});

const PARTIAL_LINE = makeLine({
  line_id: "line-partial",
  status: "Partial",
  assigned_group_ids: ["group-1"],
  covered_amount: 100000,
});

const UNRESOLVED_LINE = makeLine({
  line_id: "line-unresolved",
  status: "Unresolved",
  fund_id: "fund-1",
  assigned_group_ids: [],
  covered_amount: 0,
  candidate_groups: [],
});

const MATCHED_LINE = makeLine({ line_id: "line-matched", status: "Matched" });

const MOCK_FUNDS = [{ id: "fund-1", fund_identifier: "75", name: "CPAM 75", temp_id: null }];

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe("ReconciliationView — loading state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: MOCK_FUNDS });
  });

  it("renders the loading indicator while reconciliation has not yet computed", async () => {
    // Compute never resolves → reconciliation stays null
    mockCompute.mockReturnValue(new Promise(() => {}));

    render(
      <ReconciliationView
        bankAccountId={BANK_ACCOUNT_ID}
        parseResult={PARSE_RESULT}
        onClose={vi.fn()}
      />,
    );

    // LoadingStep does not carry a stable id but renders a spinner + message text.
    // The reconciliation-list stable id must NOT be present while loading.
    await waitFor(() => {
      expect(document.getElementById("reconciliation-list")).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Main render — reconciliation list present once compute resolves
// ---------------------------------------------------------------------------

describe("ReconciliationView — main render after compute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: MOCK_FUNDS });
  });

  it("renders the reconciliation list after the initial compute resolves", async () => {
    mockCompute.mockResolvedValue({
      success: true,
      data: makeReconciliation([MATCHED_LINE]),
    });

    render(
      <ReconciliationView
        bankAccountId={BANK_ACCOUNT_ID}
        parseResult={PARSE_RESULT}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(document.getElementById("reconciliation-list")).not.toBeNull();
    });
  });

  it("renders the validate button and calls computeBankStatementReconciliation with bankAccountId + parseResult on mount", async () => {
    mockCompute.mockResolvedValue({
      success: true,
      data: makeReconciliation([MATCHED_LINE]),
    });

    render(
      <ReconciliationView
        bankAccountId={BANK_ACCOUNT_ID}
        parseResult={PARSE_RESULT}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(document.getElementById("reconciliation-list")).not.toBeNull();
    });

    expect(mockCompute).toHaveBeenCalledWith(BANK_ACCOUNT_ID, PARSE_RESULT, []);
  });
});

// ---------------------------------------------------------------------------
// isBusy state
// ---------------------------------------------------------------------------

describe("ReconciliationView — isBusy disables buttons (BAS-064)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: MOCK_FUNDS });
  });

  it("disables the validate and cancel buttons while isBusy=true", async () => {
    // First compute resolves immediately; second (from applyCorrection) hangs
    let resolveSecond!: (v: { success: true; data: BankStatementReconciliation }) => void;

    mockCompute
      .mockResolvedValueOnce({ success: true, data: makeReconciliation([NEEDS_LINK_LINE]) })
      .mockReturnValueOnce(
        new Promise<{ success: true; data: BankStatementReconciliation }>((r) => {
          resolveSecond = r;
        }),
      );

    render(
      <ReconciliationView
        bankAccountId={BANK_ACCOUNT_ID}
        parseResult={PARSE_RESULT}
        onClose={vi.fn()}
      />,
    );

    // Wait for the list to render
    await waitFor(() => {
      expect(document.getElementById("reconciliation-list")).not.toBeNull();
    });

    // Trigger a busy compute by opening + submitting the LinkFundModal
    const lineEl = document.getElementById("reconciliation-line-row-line-needs-link");
    expect(lineEl).not.toBeNull();
    if (!lineEl) throw new Error("line row element missing");

    const user = userEvent.setup();
    await user.dblClick(lineEl);

    // LinkFundModal should now be open
    const fundSelect = document.getElementById("link-fund-modal-fund-select");
    expect(fundSelect).not.toBeNull();
    if (!fundSelect) throw new Error("fund select missing");

    await userEvent.selectOptions(fundSelect, "fund-1");
    const submitBtn = document.getElementById("link-fund-modal-submit");
    expect(submitBtn).not.toBeNull();
    if (!submitBtn) throw new Error("submit button missing");
    await user.click(submitBtn);

    // While second compute is in flight, validate + cancel should be disabled
    await waitFor(() => {
      // The two footer buttons exist and at least one is disabled (isBusy=true)
      const buttons = document.querySelectorAll(".flex.justify-end.gap-3 button");
      expect(buttons.length).toBeGreaterThan(0);
      const disabledButtons = Array.from(buttons).filter((b) => (b as HTMLButtonElement).disabled);
      expect(disabledButtons.length).toBeGreaterThan(0);
    });

    // Resolve the pending compute so cleanup can happen
    resolveSecond({ success: true, data: makeReconciliation([MATCHED_LINE]) });
  });
});

// ---------------------------------------------------------------------------
// Modal routing by line status (BAS-062)
// ---------------------------------------------------------------------------

describe("ReconciliationView — modal routing by line status (BAS-062)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: MOCK_FUNDS });
  });

  it("opens LinkFundModal when a NeedsLink line is double-clicked (BAS-062)", async () => {
    const user = userEvent.setup();
    mockCompute.mockResolvedValue({
      success: true,
      data: makeReconciliation([NEEDS_LINK_LINE]),
    });

    render(
      <ReconciliationView
        bankAccountId={BANK_ACCOUNT_ID}
        parseResult={PARSE_RESULT}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(document.getElementById("reconciliation-line-row-line-needs-link")).not.toBeNull();
    });

    const lineEl = document.getElementById("reconciliation-line-row-line-needs-link");
    if (!lineEl) throw new Error("line row element missing");
    await user.dblClick(lineEl);

    // LinkFundModal has a stable id on the fund select (F25)
    expect(document.getElementById("link-fund-modal-fund-select")).not.toBeNull();
    // AssignGroupsModal must NOT be open
    expect(document.getElementById("assign-groups-submit")).toBeNull();
    // RemainderModal must NOT be open
    expect(document.getElementById("remainder-modal-confirm")).toBeNull();
  });

  it("opens RemainderModal when a Partial line is double-clicked (BAS-062)", async () => {
    const user = userEvent.setup();
    mockCompute.mockResolvedValue({
      success: true,
      data: makeReconciliation([PARTIAL_LINE]),
    });

    render(
      <ReconciliationView
        bankAccountId={BANK_ACCOUNT_ID}
        parseResult={PARSE_RESULT}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(document.getElementById("reconciliation-line-row-line-partial")).not.toBeNull();
    });

    const lineEl = document.getElementById("reconciliation-line-row-line-partial");
    if (!lineEl) throw new Error("line row element missing");
    await user.dblClick(lineEl);

    // RemainderModal has a stable confirm button (F25)
    expect(document.getElementById("remainder-modal-confirm")).not.toBeNull();
    // LinkFundModal and AssignGroupsModal must NOT be open
    expect(document.getElementById("link-fund-modal-fund-select")).toBeNull();
    expect(document.getElementById("assign-groups-submit")).toBeNull();
  });

  it("opens AssignGroupsModal when a NeedsGroup line is double-clicked (BAS-062)", async () => {
    const user = userEvent.setup();
    mockCompute.mockResolvedValue({
      success: true,
      data: makeReconciliation([NEEDS_GROUP_LINE]),
    });

    render(
      <ReconciliationView
        bankAccountId={BANK_ACCOUNT_ID}
        parseResult={PARSE_RESULT}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(document.getElementById("reconciliation-line-row-line-needs-group")).not.toBeNull();
    });

    const lineEl = document.getElementById("reconciliation-line-row-line-needs-group");
    if (!lineEl) throw new Error("line row element missing");
    await user.dblClick(lineEl);

    expect(document.getElementById("assign-groups-submit")).not.toBeNull();
    expect(document.getElementById("link-fund-modal-fund-select")).toBeNull();
    expect(document.getElementById("remainder-modal-confirm")).toBeNull();
  });

  it("opens AssignGroupsModal when an Unresolved line is double-clicked (BAS-062)", async () => {
    const user = userEvent.setup();
    mockCompute.mockResolvedValue({
      success: true,
      data: makeReconciliation([UNRESOLVED_LINE]),
    });

    render(
      <ReconciliationView
        bankAccountId={BANK_ACCOUNT_ID}
        parseResult={PARSE_RESULT}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(document.getElementById("reconciliation-line-row-line-unresolved")).not.toBeNull();
    });

    const lineEl = document.getElementById("reconciliation-line-row-line-unresolved");
    if (!lineEl) throw new Error("line row element missing");
    await user.dblClick(lineEl);

    expect(document.getElementById("assign-groups-submit")).not.toBeNull();
    expect(document.getElementById("link-fund-modal-fund-select")).toBeNull();
  });

  it("opens AssignGroupsModal for a Matched line (override — BAS-062)", async () => {
    const user = userEvent.setup();
    mockCompute.mockResolvedValue({
      success: true,
      data: makeReconciliation([MATCHED_LINE]),
    });

    render(
      <ReconciliationView
        bankAccountId={BANK_ACCOUNT_ID}
        parseResult={PARSE_RESULT}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(document.getElementById("reconciliation-line-row-line-matched")).not.toBeNull();
    });

    const lineEl = document.getElementById("reconciliation-line-row-line-matched");
    if (!lineEl) throw new Error("line row element missing");
    await user.dblClick(lineEl);

    expect(document.getElementById("assign-groups-submit")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// applyCorrection from a modal — calls hook + closes modal (BAS-064)
// ---------------------------------------------------------------------------

describe("ReconciliationView — applyCorrection from modal (BAS-064)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: MOCK_FUNDS });
  });

  it("calls computeBankStatementReconciliation with the LinkFund correction and closes the modal", async () => {
    const user = userEvent.setup();
    const AFTER_CORRECTION = makeReconciliation([{ ...NEEDS_LINK_LINE, status: "NeedsGroup" }]);

    mockCompute
      .mockResolvedValueOnce({ success: true, data: makeReconciliation([NEEDS_LINK_LINE]) })
      .mockResolvedValueOnce({ success: true, data: AFTER_CORRECTION });

    render(
      <ReconciliationView
        bankAccountId={BANK_ACCOUNT_ID}
        parseResult={PARSE_RESULT}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(document.getElementById("reconciliation-line-row-line-needs-link")).not.toBeNull();
    });

    // Open LinkFundModal
    const lineEl = document.getElementById("reconciliation-line-row-line-needs-link");
    if (!lineEl) throw new Error("line row element missing");
    await user.dblClick(lineEl);

    const fundSelect = document.getElementById("link-fund-modal-fund-select");
    if (!fundSelect) throw new Error("fund select missing");
    await userEvent.selectOptions(fundSelect, "fund-1");

    const submitBtn = document.getElementById("link-fund-modal-submit");
    if (!submitBtn) throw new Error("submit button missing");
    await user.click(submitBtn);

    // After submit: compute called with the LinkFund correction
    await waitFor(() => {
      const calls = mockCompute.mock.calls;
      const correctionCall = calls.find(
        (c) =>
          c[2].length > 0 &&
          c[2][0]?.type === "LinkFund" &&
          (c[2][0] as { assignment: { type: string } }).assignment.type === "Fund",
      );
      expect(correctionCall).toBeDefined();
    });

    // Modal closes — fund select no longer in DOM
    await waitFor(() => {
      expect(document.getElementById("link-fund-modal-fund-select")).toBeNull();
    });
  });

  it("calls computeBankStatementReconciliation with the AcknowledgeRemainder correction and closes the modal", async () => {
    const user = userEvent.setup();
    mockCompute
      .mockResolvedValueOnce({ success: true, data: makeReconciliation([PARTIAL_LINE]) })
      .mockResolvedValueOnce({
        success: true,
        data: makeReconciliation([{ ...PARTIAL_LINE, status: "Matched" }]),
      });

    render(
      <ReconciliationView
        bankAccountId={BANK_ACCOUNT_ID}
        parseResult={PARSE_RESULT}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(document.getElementById("reconciliation-line-row-line-partial")).not.toBeNull();
    });

    const lineEl = document.getElementById("reconciliation-line-row-line-partial");
    if (!lineEl) throw new Error("line row element missing");
    await user.dblClick(lineEl);

    const confirmBtn = document.getElementById("remainder-modal-confirm");
    if (!confirmBtn) throw new Error("confirm button missing");
    await user.click(confirmBtn);

    await waitFor(() => {
      const calls = mockCompute.mock.calls;
      const correctionCall = calls.find(
        (c) => c[2].length > 0 && c[2][0]?.type === "AcknowledgeRemainder",
      );
      expect(correctionCall).toBeDefined();
    });

    // RemainderModal closes
    await waitFor(() => {
      expect(document.getElementById("remainder-modal-confirm")).toBeNull();
    });
  });

  it("calls computeBankStatementReconciliation with AssignGroups correction and closes AssignGroupsModal", async () => {
    const user = userEvent.setup();
    mockCompute
      .mockResolvedValueOnce({ success: true, data: makeReconciliation([NEEDS_GROUP_LINE]) })
      .mockResolvedValueOnce({
        success: true,
        data: makeReconciliation([{ ...NEEDS_GROUP_LINE, status: "Matched" }]),
      });

    render(
      <ReconciliationView
        bankAccountId={BANK_ACCOUNT_ID}
        parseResult={PARSE_RESULT}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(document.getElementById("reconciliation-line-row-line-needs-group")).not.toBeNull();
    });

    const lineEl = document.getElementById("reconciliation-line-row-line-needs-group");
    if (!lineEl) throw new Error("line row element missing");
    await user.dblClick(lineEl);

    // Select group-1 via its checkbox
    const checkbox = document.getElementById("assign-groups-check-group-1");
    if (!checkbox) throw new Error("candidate checkbox missing");
    await user.click(checkbox);

    const submitBtn = document.getElementById("assign-groups-submit");
    if (!submitBtn) throw new Error("submit button missing");
    await user.click(submitBtn);

    await waitFor(() => {
      const calls = mockCompute.mock.calls;
      const correctionCall = calls.find((c) => c[2].length > 0 && c[2][0]?.type === "AssignGroups");
      expect(correctionCall).toBeDefined();
    });

    // AssignGroupsModal closes
    await waitFor(() => {
      expect(document.getElementById("assign-groups-submit")).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Wizard button → ReconciliationWizard; apply / abandon / complete (BAS-100–103)
// ---------------------------------------------------------------------------

describe("ReconciliationView — wizard flow (BAS-100–103)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: MOCK_FUNDS });
  });

  it("opens ReconciliationWizard when the wizard button is clicked (BAS-100)", async () => {
    const user = userEvent.setup();
    mockCompute.mockResolvedValue({
      success: true,
      data: makeReconciliation([NEEDS_LINK_LINE]),
    });

    render(
      <ReconciliationView
        bankAccountId={BANK_ACCOUNT_ID}
        parseResult={PARSE_RESULT}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(document.getElementById("reconciliation-wizard-btn")).not.toBeNull();
    });

    const wizardBtn = document.getElementById("reconciliation-wizard-btn");
    if (!wizardBtn) throw new Error("wizard button missing");
    await user.click(wizardBtn);

    // ReconciliationWizard renders a current-step indicator (stable id from wizard tests)
    expect(document.getElementById("wizard-current-step")).not.toBeNull();
  });

  it("closes the wizard when the abandon button is clicked (BAS-103)", async () => {
    const user = userEvent.setup();
    mockCompute.mockResolvedValue({
      success: true,
      data: makeReconciliation([NEEDS_LINK_LINE]),
    });

    render(
      <ReconciliationView
        bankAccountId={BANK_ACCOUNT_ID}
        parseResult={PARSE_RESULT}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(document.getElementById("reconciliation-wizard-btn")).not.toBeNull();
    });

    await user.click(document.getElementById("reconciliation-wizard-btn")!);
    expect(document.getElementById("wizard-current-step")).not.toBeNull();

    const abandonBtn = document.getElementById("wizard-abandon");
    if (!abandonBtn) throw new Error("wizard abandon button missing");
    await user.click(abandonBtn);

    // Wizard closed
    await waitFor(() => {
      expect(document.getElementById("wizard-current-step")).toBeNull();
    });
  });

  it("closes the wizard when the complete/done button is clicked (BAS-103 — no auto-validate)", async () => {
    const user = userEvent.setup();
    // All lines matched → wizard shows "done" immediately (no steps to complete)
    mockCompute.mockResolvedValue({
      success: true,
      data: makeReconciliation([MATCHED_LINE]),
    });

    render(
      <ReconciliationView
        bankAccountId={BANK_ACCOUNT_ID}
        parseResult={PARSE_RESULT}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(document.getElementById("reconciliation-wizard-btn")).not.toBeNull();
    });

    await user.click(document.getElementById("reconciliation-wizard-btn")!);

    const doneBtn = document.getElementById("wizard-done");
    if (!doneBtn) throw new Error("wizard done button missing");
    await user.click(doneBtn);

    // Wizard closed; validate NOT called (BAS-103)
    await waitFor(() => {
      expect(document.getElementById("wizard-done")).toBeNull();
    });
    expect(mockValidate).not.toHaveBeenCalled();
  });

  it("calls computeBankStatementReconciliation when a wizard step is applied (BAS-102)", async () => {
    const user = userEvent.setup();
    mockCompute
      .mockResolvedValueOnce({ success: true, data: makeReconciliation([NEEDS_LINK_LINE]) })
      .mockResolvedValueOnce({
        success: true,
        data: makeReconciliation([{ ...NEEDS_LINK_LINE, status: "NeedsGroup" }]),
      });

    render(
      <ReconciliationView
        bankAccountId={BANK_ACCOUNT_ID}
        parseResult={PARSE_RESULT}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(document.getElementById("reconciliation-wizard-btn")).not.toBeNull();
    });

    await user.click(document.getElementById("reconciliation-wizard-btn")!);

    // Wizard phase-1 step: select fund and apply
    const wizardFundSelect = document.getElementById("wizard-fund-select");
    if (!wizardFundSelect) throw new Error("wizard fund select missing");
    await userEvent.selectOptions(wizardFundSelect, "fund-1");

    const applyBtn = document.getElementById("wizard-apply-step");
    if (!applyBtn) throw new Error("wizard apply button missing");
    await user.click(applyBtn);

    // compute called again with LinkFund correction
    await waitFor(() => {
      const calls = mockCompute.mock.calls;
      expect(calls.length).toBeGreaterThan(1);
      const correctionCall = calls.find((c) => c[2].length > 0 && c[2][0]?.type === "LinkFund");
      expect(correctionCall).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Validate → done/summary state (BAS-093)
// ---------------------------------------------------------------------------

describe("ReconciliationView — validate flow (BAS-093)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: MOCK_FUNDS });
  });

  it("calls validateBankStatementReconciliation and shows done/summary state on success (BAS-093)", async () => {
    const user = userEvent.setup();
    const RECONCILIATION = makeReconciliation([MATCHED_LINE]);
    mockCompute.mockResolvedValue({ success: true, data: RECONCILIATION });
    mockValidate.mockResolvedValue({ success: true, data: 5 });

    render(
      <ReconciliationView
        bankAccountId={BANK_ACCOUNT_ID}
        parseResult={PARSE_RESULT}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(document.getElementById("reconciliation-list")).not.toBeNull();
    });

    // Click validate — the button is the primary one in the footer
    const validateBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("statement.modal.validate"),
    ) as HTMLButtonElement | null;
    expect(validateBtn).not.toBeNull();
    if (!validateBtn) throw new Error("validate button missing");
    await user.click(validateBtn);

    expect(mockValidate).toHaveBeenCalledWith(BANK_ACCOUNT_ID, PARSE_RESULT, []);

    // Done summary state: reconciliation-list is gone, success text present
    await waitFor(() => {
      expect(document.getElementById("reconciliation-list")).toBeNull();
    });
    // The done text key is "statement.modal.done" (passed through i18n mock with count)
    const doneText = Array.from(document.querySelectorAll("p")).find((p) =>
      p.textContent?.includes("statement.modal.done"),
    );
    expect(doneText).not.toBeNull();
  });

  it("calls onClose from the done/summary close button (BAS-093)", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockCompute.mockResolvedValue({ success: true, data: makeReconciliation([MATCHED_LINE]) });
    mockValidate.mockResolvedValue({ success: true, data: 3 });

    render(
      <ReconciliationView
        bankAccountId={BANK_ACCOUNT_ID}
        parseResult={PARSE_RESULT}
        onClose={onClose}
      />,
    );

    await waitFor(() => {
      expect(document.getElementById("reconciliation-list")).not.toBeNull();
    });

    const validateBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("statement.modal.validate"),
    ) as HTMLButtonElement | null;
    if (!validateBtn) throw new Error("validate button missing");
    await user.click(validateBtn);

    await waitFor(() => {
      expect(document.getElementById("reconciliation-list")).toBeNull();
    });

    // The done-summary close button
    const closeBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("statement.modal.close"),
    ) as HTMLButtonElement | null;
    expect(closeBtn).not.toBeNull();
    if (!closeBtn) throw new Error("done close button missing");
    await user.click(closeBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("validate returning null (error) does NOT transition to done state", async () => {
    const user = userEvent.setup();
    const RECONCILIATION = makeReconciliation([NEEDS_LINK_LINE]);
    mockCompute.mockResolvedValue({ success: true, data: RECONCILIATION });
    // validate returns an error → hook returns null
    mockValidate.mockResolvedValue({
      success: false,
      error: { code: "DatabaseError" },
    });

    render(
      <ReconciliationView
        bankAccountId={BANK_ACCOUNT_ID}
        parseResult={PARSE_RESULT}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(document.getElementById("reconciliation-list")).not.toBeNull();
    });

    const validateBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("statement.modal.validate"),
    ) as HTMLButtonElement | null;
    if (!validateBtn) throw new Error("validate button missing");
    await user.click(validateBtn);

    // After validate error: list still present, no done text
    await waitFor(() => {
      // The error is surfaced via ErrorStep (role="alert" in ErrorStep)
      expect(document.getElementById("reconciliation-list")).not.toBeNull();
    });

    // No done summary text
    const doneText = Array.from(document.querySelectorAll("p")).find((p) =>
      p.textContent?.includes("statement.modal.done"),
    );
    expect(doneText).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Typed error render via F27 pipeline (BAS-064 compute error)
// ---------------------------------------------------------------------------

describe("ReconciliationView — typed error render (F27)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: MOCK_FUNDS });
  });

  it("surfaces an error via ErrorStep when computeBankStatementReconciliation returns an error after a correction", async () => {
    const user = userEvent.setup();

    mockCompute
      .mockResolvedValueOnce({ success: true, data: makeReconciliation([NEEDS_GROUP_LINE]) })
      .mockResolvedValueOnce({ success: false, error: { code: "AssignmentOverflow" } });

    render(
      <ReconciliationView
        bankAccountId={BANK_ACCOUNT_ID}
        parseResult={PARSE_RESULT}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(document.getElementById("reconciliation-line-row-line-needs-group")).not.toBeNull();
    });

    // Open AssignGroupsModal and submit — compute fails with AssignmentOverflow
    const lineEl = document.getElementById("reconciliation-line-row-line-needs-group");
    if (!lineEl) throw new Error("line row element missing");
    await user.dblClick(lineEl);

    const checkbox = document.getElementById("assign-groups-check-group-1");
    if (!checkbox) throw new Error("candidate checkbox missing");
    await user.click(checkbox);

    const submitBtn = document.getElementById("assign-groups-submit");
    if (!submitBtn) throw new Error("submit button missing");
    await user.click(submitBtn);

    // The error key is mapped by presentReconciliationError:
    // "AssignmentOverflow" → "bank:reconciliation.error.assignment_overflow"
    // Then t() is called, passing through the key unchanged in the mock.
    await waitFor(() => {
      const alert = document.querySelector("[role='alert']");
      expect(alert).not.toBeNull();
      expect(alert?.textContent).toContain("bank:reconciliation.error.assignment_overflow");
    });
  });
});

// ---------------------------------------------------------------------------
// Modal cancel paths — closes modal without calling applyCorrection (lines 102/114/128)
// ---------------------------------------------------------------------------

describe("ReconciliationView — modal cancel closes the modal (BAS-062)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: MOCK_FUNDS });
  });

  it("cancelling LinkFundModal closes it without calling computeBankStatementReconciliation again", async () => {
    const user = userEvent.setup();
    mockCompute.mockResolvedValue({
      success: true,
      data: makeReconciliation([NEEDS_LINK_LINE]),
    });

    render(
      <ReconciliationView
        bankAccountId={BANK_ACCOUNT_ID}
        parseResult={PARSE_RESULT}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(document.getElementById("reconciliation-line-row-line-needs-link")).not.toBeNull();
    });

    const callCountAfterMount = mockCompute.mock.calls.length;

    await user.dblClick(document.getElementById("reconciliation-line-row-line-needs-link")!);
    expect(document.getElementById("link-fund-modal-fund-select")).not.toBeNull();

    await user.click(document.getElementById("link-fund-modal-cancel")!);

    // Modal closed
    await waitFor(() => {
      expect(document.getElementById("link-fund-modal-fund-select")).toBeNull();
    });
    // No extra compute call — applyCorrection was not called
    expect(mockCompute).toHaveBeenCalledTimes(callCountAfterMount);
  });

  it("cancelling RemainderModal closes it without calling computeBankStatementReconciliation again", async () => {
    const user = userEvent.setup();
    mockCompute.mockResolvedValue({
      success: true,
      data: makeReconciliation([PARTIAL_LINE]),
    });

    render(
      <ReconciliationView
        bankAccountId={BANK_ACCOUNT_ID}
        parseResult={PARSE_RESULT}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(document.getElementById("reconciliation-line-row-line-partial")).not.toBeNull();
    });

    const callCountAfterMount = mockCompute.mock.calls.length;

    await user.dblClick(document.getElementById("reconciliation-line-row-line-partial")!);
    expect(document.getElementById("remainder-modal-confirm")).not.toBeNull();

    await user.click(document.getElementById("remainder-modal-cancel")!);

    await waitFor(() => {
      expect(document.getElementById("remainder-modal-confirm")).toBeNull();
    });
    expect(mockCompute).toHaveBeenCalledTimes(callCountAfterMount);
  });

  it("cancelling AssignGroupsModal closes it without calling computeBankStatementReconciliation again", async () => {
    const user = userEvent.setup();
    mockCompute.mockResolvedValue({
      success: true,
      data: makeReconciliation([NEEDS_GROUP_LINE]),
    });

    render(
      <ReconciliationView
        bankAccountId={BANK_ACCOUNT_ID}
        parseResult={PARSE_RESULT}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(document.getElementById("reconciliation-line-row-line-needs-group")).not.toBeNull();
    });

    const callCountAfterMount = mockCompute.mock.calls.length;

    await user.dblClick(document.getElementById("reconciliation-line-row-line-needs-group")!);
    expect(document.getElementById("assign-groups-submit")).not.toBeNull();

    await user.click(document.getElementById("assign-groups-cancel")!);

    await waitFor(() => {
      expect(document.getElementById("assign-groups-submit")).toBeNull();
    });
    expect(mockCompute).toHaveBeenCalledTimes(callCountAfterMount);
  });
});
