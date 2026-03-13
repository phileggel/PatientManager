/// <reference types="vitest/globals" />

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import * as useProcedureDataModule from "../hooks/useProcedureData";
import ProcedurePage from "./ProcedurePage";

vi.mock("../hooks/useProcedureData");
vi.mock("./WorkflowTable", () => ({
  WorkflowTable: ({
    onAddNewRow,
    initialRows,
  }: {
    onAddNewRow: () => void;
    initialRows: Array<{ rowId: string; draftPeriod: string | null }>;
  }) => (
    <div>
      <button type="button" onClick={onAddNewRow}>
        Add Row
      </button>
      <div data-testid="row-count">{initialRows.length}</div>
      {initialRows.map((row) => (
        <div key={row.rowId} data-testid={`draft-period-${row.rowId}`}>
          {row.draftPeriod}
        </div>
      ))}
    </div>
  ),
}));
vi.mock("./PeriodSelector", () => ({
  PeriodSelector: () => <div>Period Selector</div>,
}));

describe("ProcedurePage", () => {
  test("creates draft with correct draftPeriod when adding new row", async () => {
    const mockHandlers = {
      saveRow: vi.fn(),
      updateRow: vi.fn(),
      savePatient: vi.fn(),
      saveFund: vi.fn(),
      saveProcedureType: vi.fn(),
      deleteRow: vi.fn(),
    };

    vi.mocked(useProcedureDataModule.useProcedureData).mockReturnValue({
      initialRows: [],
      patients: [],
      funds: [],
      procedureTypes: [],
      isLoading: false,
      error: null,
      handlers: mockHandlers,
    });

    const user = userEvent.setup();
    render(<ProcedurePage />);

    await waitFor(
      () => expect(screen.queryByText("Loading procedures...")).not.toBeInTheDocument(),
      { timeout: 1000 },
    );

    const addButton = screen.getByText("Add Row");
    await user.click(addButton);

    // Draft should be created with current period (February 2026 based on mock date)
    const currentDate = new Date();
    const expectedPeriod = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, "0")}`;

    await waitFor(
      () => {
        const draftPeriodElements = screen.queryAllByTestId(/^draft-period-/);
        expect(draftPeriodElements.length).toBeGreaterThan(0);
        expect(draftPeriodElements[0]?.textContent).toBe(expectedPeriod);
      },
      { timeout: 1000 },
    );
  });
});
