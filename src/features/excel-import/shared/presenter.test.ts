import { describe, expect, it } from "vitest";
import type { ExcelImportError } from "@/bindings";
import { formatExcelImportError } from "./presenter";

/**
 * Layer 3 (F27 typed-error pipeline): pure code → i18n key mapping for the
 * excel-import use case. No runtime dependency on i18next.
 */
describe("formatExcelImportError", () => {
  it("maps FileNotFound to its key (path payload dropped — not user-actionable)", () => {
    const err: ExcelImportError = { code: "FileNotFound", path: "/tmp/x.xlsx" };
    expect(formatExcelImportError(err)).toEqual({
      key: "excel-import:errors.file_not_found",
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

  it("maps DatabaseError to its key", () => {
    const err: ExcelImportError = { code: "DatabaseError" };
    expect(formatExcelImportError(err)).toEqual({
      key: "excel-import:errors.database_error",
    });
  });
});
