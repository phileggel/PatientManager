/**
 * RTL component integration tests — LinkFundModal (BAS-030/032/036/066).
 *
 * Tests the visible UI states of the link-fund correction modal:
 *   - renders with heuristic suggestion (BAS-032/033)
 *   - submitting a fund assignment calls onSubmit with LinkFund correction (BAS-066)
 *   - submitting rejection calls onSubmit with Rejected assignment (BAS-030)
 *   - empty field for unknown label (BAS-036)
 *   - cancel calls onCancel
 *
 * Mocks gateway at feature boundary (F3). Stable id selectors (F25).
 * These tests fail until ui/LinkFundModal.tsx is created.
 */

import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BankStatementLine, Fund } from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";

vi.mock("../gateway", () => ({
  parseBankStatement: vi.fn(),
  resolveBankAccountFromIban: vi.fn(),
  computeBankStatementReconciliation: vi.fn(),
  validateBankStatementReconciliation: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}));

import { LinkFundModal } from "./LinkFundModal";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_FUNDS: Fund[] = [
  { id: "fund-1", fund_identifier: "75", name: "CPAM 75", temp_id: null },
  { id: "fund-2", fund_identifier: "93", name: "CPAM 93", temp_id: null },
];

function makeNeedsLinkLine(overrides: Partial<BankStatementLine> = {}): BankStatementLine {
  return {
    line_id: "line-needs-link",
    credit_line: { date: "2026-04-11", label: "MGEN", amount: 75000 },
    status: "NeedsLink",
    fund_id: null,
    assigned_group_ids: [],
    covered_amount: 0,
    remainder_acknowledged: false,
    candidate_groups: [],
    suggested_fund_id: null,
    suggested_fund_name: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LinkFundModal — BAS-030/032/036/066", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: MOCK_FUNDS });
  });

  // BAS-036 — empty field for unknown label (no suggestion, no pre-fill)
  it("renders with empty fund selection for a label with no saved mapping (BAS-036)", () => {
    const line = makeNeedsLinkLine();

    render(<LinkFundModal line={line} isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);

    const fundSelect = document.getElementById(
      "link-fund-modal-fund-select",
    ) as HTMLSelectElement | null;
    expect(fundSelect).not.toBeNull();
    expect(fundSelect?.value).toBe("");
  });

  // BAS-032/033 — heuristic suggestion shown as hint text (never pre-selected)
  it("renders heuristic suggestion as helper text but does not pre-select it (BAS-032/033)", () => {
    const line = makeNeedsLinkLine({
      suggested_fund_id: "fund-1",
      suggested_fund_name: "CPAM 75",
    });

    render(<LinkFundModal line={line} isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);

    // Suggestion text visible (i18n key used, F24)
    const suggestionEl = document.getElementById("link-fund-modal-suggestion");
    expect(suggestionEl).not.toBeNull();

    // Select field still empty (suggestion must NOT be pre-selected — BAS-033)
    const fundSelect = document.getElementById(
      "link-fund-modal-fund-select",
    ) as HTMLSelectElement | null;
    expect(fundSelect?.value).toBe("");
  });

  // BAS-066 — submitting a fund assignment produces a LinkFund correction with Fund assignment
  it("calls onSubmit with LinkFund/Fund correction when a fund is selected and confirmed (BAS-066)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const line = makeNeedsLinkLine();

    render(<LinkFundModal line={line} isOpen={true} onSubmit={onSubmit} onCancel={vi.fn()} />);

    const fundSelect = document.getElementById("link-fund-modal-fund-select");
    expect(fundSelect).not.toBeNull();
    if (!fundSelect) throw new Error("fund select missing");

    await userEvent.selectOptions(fundSelect, "fund-1");

    const submitBtn = document.getElementById("link-fund-modal-submit");
    expect(submitBtn).not.toBeNull();
    if (!submitBtn) throw new Error("submit button missing");

    await user.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledWith({
      type: "LinkFund",
      bank_label: "MGEN",
      assignment: { type: "Fund", fund_id: "fund-1" },
    });
  });

  // BAS-030 — marking a label as rejected produces a LinkFund/Rejected correction
  it("calls onSubmit with LinkFund/Rejected correction when rejection is selected (BAS-030)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const line = makeNeedsLinkLine();

    render(<LinkFundModal line={line} isOpen={true} onSubmit={onSubmit} onCancel={vi.fn()} />);

    const rejectBtn = document.getElementById("link-fund-modal-reject");
    expect(rejectBtn).not.toBeNull();
    if (!rejectBtn) throw new Error("reject button missing");

    await user.click(rejectBtn);

    expect(onSubmit).toHaveBeenCalledWith({
      type: "LinkFund",
      bank_label: "MGEN",
      assignment: { type: "Rejected" },
    });
  });

  // Cancel button calls onCancel without triggering onSubmit
  it("calls onCancel and does not call onSubmit when cancel is clicked", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const line = makeNeedsLinkLine();

    render(<LinkFundModal line={line} isOpen={true} onSubmit={onSubmit} onCancel={onCancel} />);

    const cancelBtn = document.getElementById("link-fund-modal-cancel");
    expect(cancelBtn).not.toBeNull();
    if (!cancelBtn) throw new Error("cancel button missing");

    await user.click(cancelBtn);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
