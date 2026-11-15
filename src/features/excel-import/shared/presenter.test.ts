import { describe, expect, it } from "vitest";
import type { ExcelImportError } from "@/bindings";
import { formatExcelImportError, formatGoneTypeError, goneTypeDetails } from "./presenter";

/**
 * Layer 3 (F27 typed-error pipeline): pure code → i18n key mapping for the
 * excel-import use case. No runtime dependency on i18next.
 */
describe("formatExcelImportError", () => {
  it("maps PathRejected to its key", () => {
    const err: ExcelImportError = { code: "PathRejected" };
    expect(formatExcelImportError(err)).toEqual({
      key: "excel-import:errors.path_rejected",
    });
  });

  it("maps InvalidFormat to its key", () => {
    const err: ExcelImportError = { code: "InvalidFormat" };
    expect(formatExcelImportError(err)).toEqual({
      key: "excel-import:errors.invalid_format",
    });
  });

  it("maps ParseError to its key", () => {
    const err: ExcelImportError = { code: "ParseError" };
    expect(formatExcelImportError(err)).toEqual({
      key: "excel-import:errors.parse_error",
    });
  });

  it("maps ImportFailed to its key", () => {
    const err: ExcelImportError = { code: "ImportFailed" };
    expect(formatExcelImportError(err)).toEqual({
      key: "excel-import:errors.import_failed",
    });
  });

  it.each([
    "PatientInvalid",
    "FundInvalid",
  ] as const)("keeps the import's failure message for %s", (code) => {
    expect(formatExcelImportError({ code })).toEqual({
      key: "excel-import:errors.import_failed",
    });
  });

  it("maps ProcedureTypeNotFound to its own key (EXI-151)", () => {
    const err: ExcelImportError = { code: "ProcedureTypeNotFound", procedure_type_id: "type-1" };
    expect(formatExcelImportError(err)).toEqual({
      key: "excel-import:errors.procedure_type_not_found",
    });
  });

  it("maps DatabaseError to its key", () => {
    const err: ExcelImportError = { code: "DatabaseError" };
    expect(formatExcelImportError(err)).toEqual({
      key: "excel-import:errors.database_error",
    });
  });
});

describe("goneTypeDetails — EXI-151 (#621)", () => {
  const rows = [
    { tmp_id: "tmp-a", amount: 50000 },
    { tmp_id: "tmp-b", amount: 70000 },
    { tmp_id: "tmp-c", amount: 90000 },
  ];
  const mapping = { "tmp-a": "type-gone", "tmp-b": "type-1", "tmp-c": "type-gone" };

  it("names the type the cache still holds, with every amount mapped to it", () => {
    const types = [{ id: "type-gone", name: "Bilan", default_amount: 50000, category: null }];
    expect(goneTypeDetails("type-gone", mapping, rows, types)).toEqual({
      name: "Bilan",
      amounts: [50000, 90000],
    });
  });

  it("gives the amounts alone once the type left the cache", () => {
    expect(goneTypeDetails("type-gone", mapping, rows, [])).toEqual({
      name: null,
      amounts: [50000, 90000],
    });
  });
});

describe("formatGoneTypeError — EXI-151 (#621)", () => {
  it("names the type and its amounts when both are known", () => {
    expect(formatGoneTypeError("Bilan", "50,00 €")).toEqual({
      key: "excel-import:errors.procedure_type_not_found_named",
      params: { name: "Bilan", amounts: "50,00 €" },
    });
  });

  it("gives the amounts alone once the name is gone", () => {
    expect(formatGoneTypeError(null, "50,00 €")).toEqual({
      key: "excel-import:errors.procedure_type_not_found_for",
      params: { amounts: "50,00 €" },
    });
  });

  it("falls back to the generic message when no row uses the type", () => {
    expect(formatGoneTypeError("Bilan", "")).toEqual({
      key: "excel-import:errors.procedure_type_not_found",
    });
  });
});
