import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as excelImportService from "../api/gateway";
import { ImportExcelPage } from "./ImportExcelPage";

vi.mock("../api/gateway");

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

const defaultProps = { filePath: "/tmp/data.xlsx", onClose: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();

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
  it("starts parsing immediately when filePath is provided", async () => {
    render(<ImportExcelPage {...defaultProps} />);
    await waitFor(() => expect(mockParseExcelFile).toHaveBeenCalledWith("/tmp/data.xlsx"));
  });

  it("does not show import result on initial render", () => {
    render(<ImportExcelPage {...defaultProps} />);
    expect(screen.queryByText("Import completed successfully!")).not.toBeInTheDocument();
  });

  it("parses using the filePath prop", async () => {
    render(<ImportExcelPage filePath="/tmp/custom.xlsx" onClose={vi.fn()} />);
    await waitFor(() => expect(mockParseExcelFile).toHaveBeenCalledWith("/tmp/custom.xlsx"));
  });

  it("handles parse error gracefully — shows alert", async () => {
    mockParseExcelFile.mockResolvedValue({
      success: false,
      error: "Failed to parse Excel file: Invalid format",
    });

    render(<ImportExcelPage {...defaultProps} />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });

  it("skips to complete when parsed data has no procedures", async () => {
    mockParseExcelFile.mockResolvedValue({ success: true, data: parsedDataNoProcedures });

    render(<ImportExcelPage {...defaultProps} />);
    await waitFor(() => expect(mockExecuteExcelImport).toHaveBeenCalledOnce());
    expect(mockExecuteExcelImport).toHaveBeenCalledWith(parsedDataNoProcedures, {}, []);
  });

  it("does not call executeExcelImport before mapping is confirmed", async () => {
    render(<ImportExcelPage {...defaultProps} />);
    await waitFor(() => expect(mockParseExcelFile).toHaveBeenCalled());
    expect(mockExecuteExcelImport).not.toHaveBeenCalled();
  });

  it("does not show error alert initially", () => {
    render(<ImportExcelPage {...defaultProps} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not show import result counts on initial render", () => {
    render(<ImportExcelPage {...defaultProps} />);
    expect(screen.queryByText("Patients processed")).not.toBeInTheDocument();
    expect(screen.queryByText("Procedures created")).not.toBeInTheDocument();
  });
});
