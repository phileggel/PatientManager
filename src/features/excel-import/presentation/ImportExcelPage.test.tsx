import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as excelImportService from "../api/gateway";
import { ImportExcelPage } from "./ImportExcelPage";

// Mock the service module
vi.mock("../api/gateway");

// Mock Tauri dialog — must be hoisted so vi.mock factory can reference it
const mockOpen = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mockOpen }));

// Mock procedure types from store
interface MockAppState {
  procedureTypes: Array<{ id: string; name: string; default_amount: number; category: string }>;
}

vi.mock("@/lib/appStore", () => ({
  useAppStore: (selector: (state: MockAppState) => MockAppState["procedureTypes"]) =>
    selector({
      procedureTypes: [
        { id: "type-1", name: "Consultation", default_amount: 100.5, category: "medical" },
        { id: "type-2", name: "Treatment", default_amount: 75.0, category: "medical" },
      ],
    }),
}));

const mockParseExcelFile = vi.fn();
const mockExecuteExcelImport = vi.fn();

const parsedDataWithProcedures = {
  patients: [
    {
      temp_id: "temp_pat_1",
      name: "Marie Dupont",
      ssn: "1234567890123",
      latest_fund: null,
    },
  ],
  funds: [
    {
      temp_id: "temp_fund_1",
      fund_identifier: "cpam_001",
      fund_name: "CPAM",
      fund_address: null,
    },
  ],
  procedures: [
    {
      patient_temp_id: "temp_pat_1",
      fund_temp_id: "temp_fund_1",
      procedure_type_tmp_id: "temp_proc_type_1",
      amount: 100.5,
      procedure_date: "2025-02-25",
      sheet_month: "2025-02",
      payment_method: null,
      confirmed_payment_date: null,
      paid_amount: null,
      awaited_amount: null,
    },
  ],
  total_records: 3,
  parsing_issues: {
    skipped_rows: [],
    missing_sheets: [],
  },
};

const parsedDataNoProcedures = {
  ...parsedDataWithProcedures,
  procedures: [],
};

const importExecutionResult = {
  patients_created: 1,
  patients_reused: 0,
  funds_created: 1,
  funds_reused: 0,
  procedures_created: 1,
  procedures_skipped: 0,
  procedures_deleted: 0,
  blocked_months: [],
};

beforeEach(() => {
  vi.clearAllMocks();

  // Default: picker returns null (cancelled) to avoid triggering parse in most tests
  mockOpen.mockResolvedValue(null);

  mockParseExcelFile.mockResolvedValue({
    success: true,
    data: parsedDataWithProcedures,
  });

  mockExecuteExcelImport.mockResolvedValue({
    success: true,
    data: importExecutionResult,
  });

  const serviceModule = excelImportService as Record<string, unknown>;
  serviceModule.parseExcelFile = mockParseExcelFile;
  serviceModule.executeExcelImport = mockExecuteExcelImport;
});

describe("ImportExcelPage", () => {
  it("opens the file picker on mount", async () => {
    render(<ImportExcelPage />);
    await waitFor(() => expect(mockOpen).toHaveBeenCalledOnce());
    expect(mockOpen).toHaveBeenCalledWith({
      multiple: false,
      filters: [{ name: "Excel Files", extensions: ["xlsx", "xls", "csv"] }],
    });
  });

  it("calls onClose when the file picker is cancelled", async () => {
    mockOpen.mockResolvedValue(null);
    const onClose = vi.fn();
    render(<ImportExcelPage onClose={onClose} />);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("omitting onClose does not throw when picker is cancelled", async () => {
    mockOpen.mockResolvedValue(null);
    expect(() => render(<ImportExcelPage />)).not.toThrow();
    await waitFor(() => expect(mockOpen).toHaveBeenCalled());
    // Component still renders without error
    expect(document.body).toBeInTheDocument();
  });

  it("does not show import result on initial render", () => {
    render(<ImportExcelPage />);
    expect(screen.queryByText("Import completed successfully!")).not.toBeInTheDocument();
  });

  it("parses the selected file after picker returns a path", async () => {
    mockOpen.mockResolvedValue("/tmp/data.xlsx");
    render(<ImportExcelPage />);
    await waitFor(() => expect(mockParseExcelFile).toHaveBeenCalledWith("/tmp/data.xlsx"));
  });

  it("handles parse error gracefully — shows alert, does not reopen picker", async () => {
    mockOpen.mockResolvedValue("/tmp/bad.xlsx");
    mockParseExcelFile.mockResolvedValue({
      success: false,
      error: "Failed to parse Excel file: Invalid format",
    });

    render(<ImportExcelPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    // Picker was opened exactly once on mount; error state does not auto-reopen it
    expect(mockOpen).toHaveBeenCalledOnce();
  });

  it("skips to complete when parsed data has no procedures", async () => {
    mockOpen.mockResolvedValue("/tmp/empty.xlsx");
    mockParseExcelFile.mockResolvedValue({ success: true, data: parsedDataNoProcedures });

    render(<ImportExcelPage />);
    await waitFor(() => expect(mockExecuteExcelImport).toHaveBeenCalledOnce());
    expect(mockExecuteExcelImport).toHaveBeenCalledWith(parsedDataNoProcedures, {}, []);
  });

  it("does not call executeExcelImport before mapping is confirmed", async () => {
    mockOpen.mockResolvedValue(null);
    render(<ImportExcelPage />);
    await waitFor(() => expect(mockOpen).toHaveBeenCalled());
    expect(mockExecuteExcelImport).not.toHaveBeenCalled();
  });

  it("does not show error alert initially", () => {
    render(<ImportExcelPage />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not show import result counts on initial render", () => {
    render(<ImportExcelPage />);
    expect(screen.queryByText("Patients processed")).not.toBeInTheDocument();
    expect(screen.queryByText("Procedures created")).not.toBeInTheDocument();
  });

  it("re-opens the file picker when Import Another is clicked after a successful import", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/tmp/empty.xlsx");
    mockParseExcelFile.mockResolvedValue({ success: true, data: parsedDataNoProcedures });

    render(<ImportExcelPage />);

    // Wait for the import to complete and the result screen to appear
    await waitFor(() => expect(mockExecuteExcelImport).toHaveBeenCalledOnce());

    // Picker is called a second time when "Import Another" is clicked
    mockOpen.mockResolvedValue(null);
    const importAnotherButton = await screen.findByRole("button", { name: /import another/i });
    await user.click(importAnotherButton);

    await waitFor(() => expect(mockOpen).toHaveBeenCalledTimes(2));
  });
});
