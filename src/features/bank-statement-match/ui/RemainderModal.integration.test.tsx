/**
 * RTL component integration tests — RemainderModal (BAS-092).
 *
 * Tests:
 *   - renders uncovered remainder amount (BAS-092 informational display)
 *   - confirming produces AcknowledgeRemainder correction
 *   - cancel calls onCancel
 *
 * Stable id selectors (F25). Fails until ui/RemainderModal.tsx is created.
 */

import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BankStatementLine } from "@/bindings";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}));

import { RemainderModal } from "./RemainderModal";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function makePartialLine(): BankStatementLine {
  return {
    line_id: "line-partial",
    credit_line: { date: "2026-04-10", label: "CPAM75", amount: 150000 },
    status: "Partial",
    fund_id: "fund-1",
    assigned_group_ids: ["group-1"],
    covered_amount: 120000, // 30000 remainder
    remainder_acknowledged: false,
    candidate_groups: [],
    suggested_fund_id: null,
    suggested_fund_name: null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RemainderModal — BAS-092", () => {
  beforeEach(() => vi.clearAllMocks());

  // BAS-092 — remainder amount is shown (informational only)
  it("renders the remainder amount so the user can see what they are acknowledging (BAS-092)", () => {
    const line = makePartialLine();

    render(<RemainderModal line={line} isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);

    const remainderEl = document.getElementById("remainder-modal-amount");
    expect(remainderEl).not.toBeNull();
    // The remainder is 150000 - 120000 = 30000 millicents; the UI should show it
    expect(remainderEl?.textContent).toMatch(/30/);
  });

  // BAS-092 — confirming produces AcknowledgeRemainder correction
  it("calls onSubmit with AcknowledgeRemainder correction when confirmed (BAS-092)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const line = makePartialLine();

    render(<RemainderModal line={line} isOpen={true} onSubmit={onSubmit} onCancel={vi.fn()} />);

    const confirmBtn = document.getElementById("remainder-modal-confirm");
    expect(confirmBtn).not.toBeNull();
    if (!confirmBtn) throw new Error("confirm button missing");

    await user.click(confirmBtn);

    expect(onSubmit).toHaveBeenCalledWith({
      type: "AcknowledgeRemainder",
      line_id: "line-partial",
    });
  });

  it("calls onCancel and does not call onSubmit when cancel is clicked", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const line = makePartialLine();

    render(<RemainderModal line={line} isOpen={true} onSubmit={onSubmit} onCancel={onCancel} />);

    const cancelBtn = document.getElementById("remainder-modal-cancel");
    expect(cancelBtn).not.toBeNull();
    if (!cancelBtn) throw new Error("cancel button missing");

    await user.click(cancelBtn);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
