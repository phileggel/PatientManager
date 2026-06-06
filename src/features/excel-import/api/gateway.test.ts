import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportExecutionResult, ParseExcelResponse, SkippedRow } from "@/bindings";
import { commands } from "@/bindings";
import * as gateway from "./gateway";

// Gateway tests mock at the bindings boundary — the gateway is a typed pass-through
// over commands.* (F3). We assert that the renamed selectedSheets arg is forwarded
// positionally and that skipped_procedures flows back without transformation (EXI-290).

vi.mock("@/bindings", () => ({
  commands: {
    parseExcelFile: vi.fn(),
    executeExcelImport: vi.fn(),
    getExcelAmountMappings: vi.fn(),
    saveExcelAmountMappings: vi.fn(),
  },
}));

// Minimal ParseExcelResponse fixture
const minimalParsedData: ParseExcelResponse = {
  patients: [],
  funds: [],
  procedures: [],
  total_records: 0,
  parsing_issues: { skipped_rows: [], missing_sheets: [] },
};

// Minimal ImportExecutionResult with no skipped procedures
const baseExecutionResult: ImportExecutionResult = {
  patients_created: 1,
  patients_reused: 0,
  funds_created: 1,
  funds_reused: 0,
  procedures_created: 3,
  procedures_skipped: 0,
  procedures_deleted: 0,
  blocked_months: [],
  skipped_procedures: [],
};

describe("excel-import gateway — executeExcelImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // EXI-270 — selectedSheets (renamed from selectedMonths) is passed as the third
  // positional arg to commands.executeExcelImport
  it("forwards selectedSheets as the third positional arg to commands.executeExcelImport", async () => {
    vi.mocked(commands.executeExcelImport).mockResolvedValue({
      status: "ok",
      data: baseExecutionResult,
    });

    const selectedSheets = ["Jan", "Fév", "Mars"];
    const typeMapping = { "tmp-uuid-1": "proc-type-id-1" };

    await gateway.executeExcelImport(minimalParsedData, typeMapping, selectedSheets);

    expect(commands.executeExcelImport).toHaveBeenCalledWith(
      minimalParsedData,
      typeMapping,
      selectedSheets,
    );
  });

  // Canonical sheet names — the third arg carries "Jan", "Fév", … not "2026-01" etc.
  it("passes canonical sheet names, not YYYY-MM month strings", async () => {
    vi.mocked(commands.executeExcelImport).mockResolvedValue({
      status: "ok",
      data: baseExecutionResult,
    });

    const canonicalSheets = ["Jan", "Fév"];

    await gateway.executeExcelImport(minimalParsedData, {}, canonicalSheets);

    const callArgs = vi.mocked(commands.executeExcelImport).mock.calls[0];
    if (!callArgs) throw new Error("expected at least one call to commands.executeExcelImport");
    const sheetArg = callArgs[2] as string[];
    expect(sheetArg).toEqual(["Jan", "Fév"]);
    expect(sheetArg).not.toContain("2026-01");
    expect(sheetArg).not.toContain("2026-02");
  });

  // ok pass-through — success result returns success:true with data (EXI-270/EXI-290 combined)
  it("returns success:true with ImportExecutionResult on ok response", async () => {
    vi.mocked(commands.executeExcelImport).mockResolvedValue({
      status: "ok",
      data: baseExecutionResult,
    });

    const result = await gateway.executeExcelImport(minimalParsedData, {}, ["Jan"]);

    expect(result.success).toBe(true);
    expect(result.data).toEqual(baseExecutionResult);
  });

  // EXI-290 — skipped_procedures array flows back to the caller without transformation
  it("passes skipped_procedures from ImportExecutionResult through without transformation", async () => {
    const executeSkips: SkippedRow[] = [
      { sheet: "Jan", row_number: 5, reason: "Date d'acte invalide : '32/01/2026'" },
      {
        sheet: "Fév",
        row_number: 12,
        reason: "La date d'acte 2026-01-15 ne correspond pas au mois de la feuille « Fév »",
      },
    ];
    const resultWithSkips: ImportExecutionResult = {
      ...baseExecutionResult,
      procedures_skipped: 2,
      skipped_procedures: executeSkips,
    };

    vi.mocked(commands.executeExcelImport).mockResolvedValue({
      status: "ok",
      data: resultWithSkips,
    });

    const result = await gateway.executeExcelImport(minimalParsedData, {}, ["Jan", "Fév"]);

    expect(result.success).toBe(true);
    expect(result.data?.skipped_procedures).toHaveLength(2);
    expect(result.data?.skipped_procedures).toEqual(executeSkips);
  });

  // EXI-290 — empty skipped_procedures array flows back unchanged
  it("returns empty skipped_procedures array when no execute-time skips occurred", async () => {
    vi.mocked(commands.executeExcelImport).mockResolvedValue({
      status: "ok",
      data: { ...baseExecutionResult, skipped_procedures: [] },
    });

    const result = await gateway.executeExcelImport(minimalParsedData, {}, ["Jan"]);

    expect(result.data?.skipped_procedures).toEqual([]);
  });

  // error pass-through — gateway surfaces the typed ExcelImportError verbatim
  // in success:false (F27 — no throw, no transformation)
  it("returns success:false with the typed error on error response", async () => {
    vi.mocked(commands.executeExcelImport).mockResolvedValue({
      status: "error",
      error: { code: "ImportFailed" },
    });

    const result = await gateway.executeExcelImport(minimalParsedData, {}, ["Jan"]);

    expect(result.success).toBe(false);
    expect(result.error).toEqual({ code: "ImportFailed" });
    expect(result.data).toBeUndefined();
  });

  // empty selectedSheets — valid call, passes empty array through
  it("forwards an empty selectedSheets array correctly", async () => {
    vi.mocked(commands.executeExcelImport).mockResolvedValue({
      status: "ok",
      data: { ...baseExecutionResult, procedures_created: 0 },
    });

    await gateway.executeExcelImport(minimalParsedData, {}, []);

    expect(commands.executeExcelImport).toHaveBeenCalledWith(minimalParsedData, {}, []);
  });
});
