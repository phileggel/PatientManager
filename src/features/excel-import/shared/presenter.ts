import type { ExcelImportError } from "@/bindings";

/**
 * Layer 3 of the F27 typed-error pipeline for the excel-import use case.
 * Pure `code → { key }` mapping over the flat `ExcelImportError` enum. The
 * caller (Layer 4) calls `t(key)`. No runtime dependency on i18next.
 *
 * Exhaustive over the union. No params: none of the excel-import error
 * messages interpolate a value the user can act on (the file path in
 * `FileNotFound` is the path the user just picked, so it adds nothing to the
 * toast).
 */
export function formatExcelImportError(err: ExcelImportError): { key: string } {
  switch (err.code) {
    case "FileNotFound":
      return { key: "excel-import:errors.file_not_found" };
    case "InvalidFormat":
      return { key: "excel-import:errors.invalid_format" };
    case "ParseError":
      return { key: "excel-import:errors.parse_error" };
    case "ImportFailed":
      return { key: "excel-import:errors.import_failed" };
    case "DatabaseError":
      return { key: "excel-import:errors.database_error" };
  }
}
