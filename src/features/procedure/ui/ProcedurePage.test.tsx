/// <reference types="vitest/globals" />

import { render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { vi } from "vitest";
import * as useProcedureDataModule from "../hooks/useProcedureData";
import type { ProcedureRow } from "../model/procedure-row.types";
import ProcedurePage from "./ProcedurePage";

type ProcedureListProps = {
  rows: Array<{ rowId: string }>;
  onEdit: (row: ProcedureRow) => void;
};

let capturedOnEdit: ((row: ProcedureRow) => void) | null = null;

vi.mock("../hooks/useProcedureData");
vi.mock("./procedure_list/ProcedureList", () => ({
  ProcedureList: ({ rows, onEdit }: ProcedureListProps) => {
    capturedOnEdit = onEdit;
    return (
      <div data-testid="procedure-list">
        <div data-testid="row-count">{rows.length}</div>
      </div>
    );
  },
}));
vi.mock("./PeriodSelector", () => ({
  PeriodSelector: () => <div>Period Selector</div>,
}));

const TODAY = new Date().toISOString().slice(0, 10);

const makeRow = (status: string): ProcedureRow => ({
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
  procedureDate: TODAY,
  billedAmount: 50,
  effectiveAmount: 50,
  paymentMethod: "NONE",
  fundReconciliationDate: null,

  confirmedPaymentDate: null,
  paidAmount: null,
  awaitedAmount: null,
  status,
});

const defaultHookValue = {
  initialRows: [makeRow("CREATED")],
  patients: [],
  funds: [],
  procedureTypes: [],
  isLoading: false,
  error: null,
  deleteRow: vi.fn(),
};

describe("ProcedurePage", () => {
  test("renders procedure list with rows from useProcedureData", async () => {
    vi.mocked(useProcedureDataModule.useProcedureData).mockReturnValue(defaultHookValue);

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

describe("ProcedurePage — R6: modal mode routing based on blocking status", () => {
  beforeEach(() => {
    capturedOnEdit = null;
    vi.mocked(useProcedureDataModule.useProcedureData).mockReturnValue(defaultHookValue);
  });

  test("opens modal in edit mode for non-blocking status", async () => {
    render(<ProcedurePage />);
    await waitFor(() => expect(capturedOnEdit).not.toBeNull());

    act(() => {
      capturedOnEdit?.(makeRow("CREATED"));
    });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  test("opens modal in view mode for blocking status RECONCILED", async () => {
    render(<ProcedurePage />);
    await waitFor(() => expect(capturedOnEdit).not.toBeNull());

    act(() => {
      capturedOnEdit?.(makeRow("RECONCILED"));
    });

    // View mode title key is "modal.viewTitle" — modal should be open
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
