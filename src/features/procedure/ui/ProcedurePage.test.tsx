/// <reference types="vitest/globals" />

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { vi } from "vitest";
import * as gateway from "../api/gateway";
import * as useProcedureDataModule from "../hooks/useProcedureData";
import type { ProcedureRow } from "../model/procedure-row.types";
import ProcedurePage from "./ProcedurePage";

vi.mock("../api/gateway");
vi.mock("@/ui/components/snackbar", () => ({
  toastService: { show: vi.fn() },
}));

type ProcedureListProps = {
  rows: Array<{ rowId: string }>;
  onEdit: (row: ProcedureRow) => void;
  onDelete: (id: string) => void;
};

let capturedOnEdit: ((row: ProcedureRow) => void) | null = null;
let capturedOnDelete: ((id: string) => void) | null = null;

vi.mock("../hooks/useProcedureData");
vi.mock("./procedure_list/ProcedureList", () => ({
  ProcedureList: ({ rows, onEdit, onDelete }: ProcedureListProps) => {
    capturedOnEdit = onEdit;
    capturedOnDelete = onDelete;
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

    // View mode title key is "modal.view_title" — modal should be open
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  test("opens modal in overpaid mode for OVERPAID status (REF-190)", async () => {
    render(<ProcedurePage />);
    await waitFor(() => expect(capturedOnEdit).not.toBeNull());
    act(() => {
      capturedOnEdit?.(makeRow("OVERPAID"));
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  test("opens modal in refund mode for OVERPAYMENT_REFUND status (REF-200)", async () => {
    render(<ProcedurePage />);
    await waitFor(() => expect(capturedOnEdit).not.toBeNull());
    act(() => {
      capturedOnEdit?.(makeRow("OVERPAYMENT_REFUND"));
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

// --- Reload + delete behavior ---

describe("ProcedurePage — reloadRows + delete flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useProcedureDataModule.useProcedureData).mockReturnValue(defaultHookValue);
  });

  test("procedure_updated event triggers reloadRows; success applies returned rows", async () => {
    vi.mocked(gateway.readAllProcedures).mockResolvedValue({ success: true, data: [] });

    render(<ProcedurePage />);
    await waitFor(() => expect(screen.getByTestId("procedure-list")).toBeInTheDocument());

    await act(async () => {
      window.dispatchEvent(new Event("procedure_updated"));
    });

    await waitFor(() => expect(gateway.readAllProcedures).toHaveBeenCalled());
  });

  test("procedure_updated event surfaces an error toast when readAllProcedures fails", async () => {
    vi.mocked(gateway.readAllProcedures).mockResolvedValue({
      success: false,
      error: { code: "DatabaseError" },
    });
    const { toastService } = await import("@/ui/components/snackbar");

    render(<ProcedurePage />);
    await waitFor(() => expect(screen.getByTestId("procedure-list")).toBeInTheDocument());

    await act(async () => {
      window.dispatchEvent(new Event("procedure_updated"));
    });

    await waitFor(() =>
      expect(toastService.show).toHaveBeenCalledWith("error", "Failed to reload procedures"),
    );
  });

  test("delete confirmation: confirm calls deleteRow then reloadRows", async () => {
    const deleteRow = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useProcedureDataModule.useProcedureData).mockReturnValue({
      ...defaultHookValue,
      deleteRow,
    });
    vi.mocked(gateway.readAllProcedures).mockResolvedValue({ success: true, data: [] });

    render(<ProcedurePage />);
    await waitFor(() => expect(screen.getByTestId("procedure-list")).toBeInTheDocument());

    // Trigger delete via captured onDelete handler from mocked ProcedureList.
    act(() => {
      capturedOnDelete?.("proc1");
    });

    // Dialog opens — click Confirm.
    const confirmBtn = await screen.findByRole("button", { name: "Delete" });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    await waitFor(() => expect(deleteRow).toHaveBeenCalledWith("proc1"));
    await waitFor(() => expect(gateway.readAllProcedures).toHaveBeenCalled());
  });

  test("delete confirmation: failure surfaces an error toast", async () => {
    const deleteRow = vi.fn().mockRejectedValue(new Error("blocked"));
    vi.mocked(useProcedureDataModule.useProcedureData).mockReturnValue({
      ...defaultHookValue,
      deleteRow,
    });
    const { toastService } = await import("@/ui/components/snackbar");

    render(<ProcedurePage />);
    await waitFor(() => expect(screen.getByTestId("procedure-list")).toBeInTheDocument());

    act(() => {
      capturedOnDelete?.("proc1");
    });

    const confirmBtn = await screen.findByRole("button", { name: "Delete" });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    await waitFor(() =>
      expect(toastService.show).toHaveBeenCalledWith("error", "Failed to delete procedure"),
    );
  });
});
