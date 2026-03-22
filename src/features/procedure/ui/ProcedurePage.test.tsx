/// <reference types="vitest/globals" />

import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import * as useProcedureDataModule from "../hooks/useProcedureData";
import ProcedurePage from "./ProcedurePage";

vi.mock("../hooks/useProcedureData");
vi.mock("./procedure_list/ProcedureList", () => ({
  ProcedureList: ({ rows }: { rows: Array<{ rowId: string }> }) => (
    <div data-testid="procedure-list">
      <div data-testid="row-count">{rows.length}</div>
    </div>
  ),
}));
vi.mock("./PeriodSelector", () => ({
  PeriodSelector: () => <div>Period Selector</div>,
}));

describe("ProcedurePage", () => {
  test("renders procedure list with rows from useProcedureData", async () => {
    vi.mocked(useProcedureDataModule.useProcedureData).mockReturnValue({
      initialRows: [
        {
          rowId: "r1",
          isDraft: false,
          draftPeriod: null,
          id: "proc1",
          patientId: "p1",
          patientName: "Alice",
          ssn: null,
          fundId: null,
          fundIdentifier: null,
          fundName: null,
          procedureTypeId: "t1",
          procedureName: "Consultation",
          procedureDate: new Date().toISOString().slice(0, 10),
          procedureAmount: 50,
          paymentMethod: "NONE",
          confirmedPaymentDate: null,
          actualPaymentAmount: null,
          awaitedAmount: null,
          status: "CREATED",
        },
      ],
      patients: [],
      funds: [],
      procedureTypes: [],
      isLoading: false,
      error: null,
      deleteRow: vi.fn(),
    });

    render(<ProcedurePage />);

    await waitFor(() => expect(screen.getByTestId("procedure-list")).toBeInTheDocument());
    expect(screen.getByTestId("row-count").textContent).not.toBe("0");
  });

  test("shows loading state while data is being fetched", () => {
    vi.mocked(useProcedureDataModule.useProcedureData).mockReturnValue({
      initialRows: [],
      patients: [],
      funds: [],
      procedureTypes: [],
      isLoading: true,
      error: null,
      deleteRow: vi.fn(),
    });

    render(<ProcedurePage />);
    expect(screen.getByText("Loading procedures...")).toBeInTheDocument();
  });

  test("shows error state when data loading fails", () => {
    vi.mocked(useProcedureDataModule.useProcedureData).mockReturnValue({
      initialRows: [],
      patients: [],
      funds: [],
      procedureTypes: [],
      isLoading: false,
      error: "Network error",
      deleteRow: vi.fn(),
    });

    render(<ProcedurePage />);
    expect(screen.getByText("Error loading data")).toBeInTheDocument();
    expect(screen.getByText("Network error")).toBeInTheDocument();
  });
});
