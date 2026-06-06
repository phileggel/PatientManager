// Regression guard for #60: SelectProcedureModal opens from inside the
// EditFundPaymentModal Dialog (z-100). Its overlay must render ABOVE that
// parent, so it carries z-200 (the "above-dialog" tier shared with the
// DateField popover). If a future edit drops it to z-50/z-100, the parent
// dialog would paint over it and its rows would be unselectable again.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "@/i18n/config";
import type { Procedure } from "@/bindings";
import { ProcedureSelectionModal } from "./SelectProcedureModal";

const PRELOADED: Procedure[] = [
  {
    id: "proc-1",
    patient_id: "pat-1",
    fund_id: "fund-1",
    procedure_type_id: "type-1",
    procedure_date: "2026-05-15",
    billed_amount: 25000,
    payment_method: "NONE",
    fund_reconciliation_date: "",
    confirmed_payment_date: "",
    payment_status: "CREATED",
    paid_amount: null,
  },
];

const defaultProps = {
  isOpen: true,
  fundId: "fund-1",
  initialSelectionIds: [],
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
  preloadedProcedures: PRELOADED,
};

describe("ProcedureSelectionModal — stacking (#60)", () => {
  it("renders its overlay at z-200 so it sits above the parent Dialog (z-100)", () => {
    render(<ProcedureSelectionModal {...defaultProps} />);
    const overlay = screen.getByRole("dialog");
    expect(overlay).toHaveClass("z-200");
  });

  it("does not render when closed", () => {
    render(<ProcedureSelectionModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
