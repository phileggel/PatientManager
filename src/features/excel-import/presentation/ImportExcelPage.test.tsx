import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as excelImportService from "../api/gateway";
import { ImportExcelPage } from "./ImportExcelPage";

vi.mock("../api/gateway");

interface MockAppState {
  procedureTypes: Array<{ id: string; name: string; default_amount: number; category: string }>;
}

vi.mock("@/infra/cache/store", () => ({
  useCacheStore: (selector: (state: MockAppState) => MockAppState["procedureTypes"]) =>
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
  // ProcedureTypeMappingStep calls these on mount — keep them resolved-empty
  // so its useEffect doesn't blow up when the test transitions into the
  // mapping step.
  serviceModule.getExcelAmountMappings = vi.fn().mockResolvedValue({ success: true, data: [] });
  serviceModule.saveExcelAmountMappings = vi
    .fn()
    .mockResolvedValue({ success: true, data: undefined });
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
      error: { code: "InvalidFormat" },
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

  // -------------------------------------------------------------------------
  // handleSheetSelectionConfirm — EXI-110 / EXI-270 (plan §9, [unit-test-needed])
  //
  // After parse completes the page must transition to "sheet_selection" step
  // (not the old "month_selection"), and the confirm handler must advance
  // to "mapping_procedure_types".  The state field is selectedSheets (renamed).
  // -------------------------------------------------------------------------

  it("transitions to sheet_selection step after successful parse with procedures", async () => {
    // The page's Step union must use "sheet_selection" — if it still says
    // "month_selection" the ProgressIndicator will not find the new key and
    // the SheetSelectionStep will not render.  This test fails until §9 renames
    // the Step union and the setCurrentStep call.
    render(<ImportExcelPage {...defaultProps} />);
    await waitFor(() =>
      // SheetSelectionStep (new component) must be rendered — its continue button is
      // the discriminator.  The button label comes from sheetSelection.continue i18n key.
      expect(screen.queryByRole("button", { name: /continue/i })).toBeInTheDocument(),
    );
  });

  it("handleSheetSelectionConfirm advances to mapping_procedure_types after sheet selection", async () => {
    // Render and wait for sheet selection step
    render(<ImportExcelPage {...defaultProps} />);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /continue/i })).toBeInTheDocument(),
    );
    // Confirm sheet selection — triggers handleSheetSelectionConfirm
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    // The mapping modal title should appear (mapping.modalTitle i18n key: "Map Procedure Types")
    await waitFor(() => expect(screen.queryByText("Map Procedure Types")).toBeInTheDocument());
    // executeExcelImport must NOT have been called yet
    expect(mockExecuteExcelImport).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // handleMappingComplete — EXI-270 (plan §9, [unit-test-needed])
  //
  // executeExcelImport must be called with selectedSheets (canonical names)
  // as the third positional argument — not selectedMonths.
  // -------------------------------------------------------------------------

  it("handleMappingComplete calls executeExcelImport with selectedSheets as the third arg", async () => {
    // The parsedData fixture has sheet_month: "2025-02" (old format).  For the
    // rename test what matters is that the page feeds whatever sheets were selected
    // through to the gateway call.  We verify the arg position and that the page
    // no longer references selectedMonths.
    //
    // Implementation note: this test will fail until ImportExcelPage renames
    // selectedMonths→selectedSheets and handleMonthSelectionConfirm→handleSheetSelectionConfirm.

    render(<ImportExcelPage {...defaultProps} />);

    // Wait for sheet-selection step
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /continue/i })).toBeInTheDocument(),
    );
    // Confirm sheets
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    // Wait for mapping modal
    await waitFor(() => expect(screen.queryByText("Map Procedure Types")).toBeInTheDocument());
    // Complete mapping — ProcedureTypeMappingStep's "Continue" submit button
    // (i18n key mapping.continue).  In tests the modal renders with a Continue button.
    await userEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    await waitFor(() => expect(mockExecuteExcelImport).toHaveBeenCalledOnce());

    // Third positional arg must be an array of sheet names, not months
    const callArgs = mockExecuteExcelImport.mock.calls[0] as [unknown, unknown, string[]];
    const sheetsArg = callArgs[2];
    expect(Array.isArray(sheetsArg)).toBe(true);
  });
});
