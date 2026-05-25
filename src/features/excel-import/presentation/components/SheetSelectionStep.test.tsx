// Component tests for SheetSelectionStep — render + interaction.
// Pure-function tests for extractSheets + SHEET_ORDER live in shared/sheets.test.ts.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ParseExcelResponse } from "@/bindings";
import { SheetSelectionStep } from "./SheetSelectionStep";

function makeParsedData(sheetMonths: string[]): ParseExcelResponse {
  return {
    patients: [],
    funds: [],
    procedures: sheetMonths.map((sheet_month, i) => ({
      patient_temp_id: `pat-${i}`,
      fund_temp_id: null,
      procedure_type_tmp_id: `type-${i}`,
      amount: 1000,
      procedure_date: "2026-01-15",
      sheet_month,
      payment_method: null,
      confirmed_payment_date: null,
      paid_amount: null,
      awaited_amount: null,
      source_row: i + 2,
    })),
    total_records: sheetMonths.length,
    parsing_issues: { skipped_rows: [], missing_sheets: [] },
  };
}

describe("SheetSelectionStep", () => {
  // Renders checkboxes with stable id pattern per F25
  it("renders one checkbox per distinct sheet with stable id pattern", () => {
    const data = makeParsedData(["Jan", "Fév"]);
    render(<SheetSelectionStep parsedData={data} onConfirm={vi.fn()} isLoading={false} />);
    expect(document.getElementById("sheet-selection-sheet-Jan")).toBeInTheDocument();
    expect(document.getElementById("sheet-selection-sheet-Fév")).toBeInTheDocument();
  });

  // All sheets pre-selected by default
  it("pre-selects all available sheets", () => {
    const data = makeParsedData(["Jan", "Fév"]);
    render(<SheetSelectionStep parsedData={data} onConfirm={vi.fn()} isLoading={false} />);
    expect(document.getElementById("sheet-selection-sheet-Jan") as HTMLInputElement).toBeChecked();
    expect(document.getElementById("sheet-selection-sheet-Fév") as HTMLInputElement).toBeChecked();
  });

  // onConfirm receives the canonical sheet names (EXI-270)
  it("calls onConfirm with canonical sheet names when confirmed", async () => {
    const onConfirm = vi.fn();
    const data = makeParsedData(["Jan", "Fév"]);
    render(<SheetSelectionStep parsedData={data} onConfirm={onConfirm} isLoading={false} />);
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
    const [calledSheets] = onConfirm.mock.calls[0] as [string[]];
    expect(calledSheets).toContain("Jan");
    expect(calledSheets).toContain("Fév");
    for (const sheet of calledSheets) {
      expect(sheet).not.toMatch(/^\d{4}-\d{2}$/);
    }
  });

  // Toggling an individual sheet checkbox removes it from / re-adds it to the selection
  it("excludes a sheet from onConfirm payload after its checkbox is unticked", async () => {
    const onConfirm = vi.fn();
    const data = makeParsedData(["Jan", "Fév", "Mars"]);
    render(<SheetSelectionStep parsedData={data} onConfirm={onConfirm} isLoading={false} />);
    const fevBox = document.getElementById("sheet-selection-sheet-Fév") as HTMLInputElement;
    await userEvent.click(fevBox);
    expect(fevBox.checked).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    const [calledSheets] = onConfirm.mock.calls[0] as [string[]];
    expect(calledSheets).toContain("Jan");
    expect(calledSheets).toContain("Mars");
    expect(calledSheets).not.toContain("Fév");
  });

  // Re-ticking an unticked sheet adds it back — exercises both branches of toggleSheet
  it("re-adds a sheet to the selection when its checkbox is re-ticked", async () => {
    const onConfirm = vi.fn();
    const data = makeParsedData(["Jan", "Fév"]);
    render(<SheetSelectionStep parsedData={data} onConfirm={onConfirm} isLoading={false} />);
    const janBox = document.getElementById("sheet-selection-sheet-Jan") as HTMLInputElement;
    await userEvent.click(janBox);
    expect(janBox.checked).toBe(false);
    await userEvent.click(janBox);
    expect(janBox.checked).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    const [calledSheets] = onConfirm.mock.calls[0] as [string[]];
    expect(calledSheets).toContain("Jan");
    expect(calledSheets).toContain("Fév");
  });

  // Toggle-all checkbox flips all entries off, then back on
  it("the select-all checkbox toggles every sheet at once", async () => {
    const onConfirm = vi.fn();
    const data = makeParsedData(["Jan", "Fév"]);
    render(<SheetSelectionStep parsedData={data} onConfirm={onConfirm} isLoading={false} />);
    const selectAll = document.getElementById("sheet-selection-select-all") as HTMLInputElement;
    const jan = document.getElementById("sheet-selection-sheet-Jan") as HTMLInputElement;
    const fev = document.getElementById("sheet-selection-sheet-Fév") as HTMLInputElement;
    expect(selectAll.checked).toBe(true);
    await userEvent.click(selectAll);
    expect(jan.checked).toBe(false);
    expect(fev.checked).toBe(false);
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
    await userEvent.click(selectAll);
    expect(jan.checked).toBe(true);
    expect(fev.checked).toBe(true);
    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled();
  });

  // Continue button disabled in the loading state regardless of selection
  it("disables the Continue button when isLoading is true", () => {
    const data = makeParsedData(["Jan"]);
    render(<SheetSelectionStep parsedData={data} onConfirm={vi.fn()} isLoading={true} />);
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });
});
