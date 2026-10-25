import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { NormalizedPdfLine } from "@/bindings";
import { SplitEditor } from "./SplitEditor";

const line: NormalizedPdfLine = {
  line_index: 3,
  payment_date: "2026-01-20",
  invoice_number: "INV-3",
  fund_name: "CPAM 75",
  patient_name: "DOE JANE",
  ssn: "1234567890123",
  nature: "SF",
  procedure_start_date: "2026-01-10",
  procedure_end_date: "2026-01-14",
  is_period: true,
  amount: 60000,
};

const editor = vi.hoisted(() => ({ checking: false }));
vi.mock("./useSplitEditor", () => ({
  useSplitEditor: () => ({
    rows: [{ date: "2026-01-10", amount: 30 }],
    total: 30000,
    errors: { parts: [] },
    checking: editor.checking,
    setDate: vi.fn(),
    setAmount: vi.fn(),
    addRow: vi.fn(),
    removeRow: vi.fn(),
    validate: vi.fn(),
  }),
}));

const rowControls = () =>
  ["date-0", "amount-0", "remove-0", "add", "cancel", "validate"].map(
    (id) => document.getElementById(`fund-payment-match-split-3-${id}`) as HTMLInputElement,
  );

// FPA-254 (ticket #464): the rows are locked while the split is being checked.
describe("SplitEditor — rows locked while checking (FPA-254)", () => {
  it("locks every row control while a check runs", () => {
    editor.checking = true;
    render(<SplitEditor line={line} onAccept={vi.fn()} onCancel={vi.fn()} />);

    for (const control of rowControls()) expect(control).toBeDisabled();
  });

  it("leaves them editable when no check runs", () => {
    editor.checking = false;
    render(<SplitEditor line={line} onAccept={vi.fn()} onCancel={vi.fn()} />);

    for (const control of rowControls()) expect(control).toBeEnabled();
  });
});
