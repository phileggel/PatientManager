import type { ExcelImportError, ProcedureType } from "@/bindings";
import type { ProcedureMapping } from "./mappings";

/**
 * Layer 3 of the F27 typed-error pipeline for the excel-import use case.
 * Pure `code → { key }` mapping over the flat `ExcelImportError` enum. The
 * caller (Layer 4) calls `t(key)`. No runtime dependency on i18next.
 *
 * Exhaustive over the union. No params here; the gone-type message, which
 * names its type and amounts, is `formatGoneTypeError`'s.
 */
export function formatExcelImportError(err: ExcelImportError): { key: string } {
  switch (err.code) {
    case "PathRejected":
      return { key: "excel-import:errors.path_rejected" };
    case "InvalidFormat":
      return { key: "excel-import:errors.invalid_format" };
    case "ParseError":
      return { key: "excel-import:errors.parse_error" };
    case "PatientInvalid":
    case "FundInvalid":
    case "ImportFailed":
      return { key: "excel-import:errors.import_failed" };
    case "DatabaseError":
      return { key: "excel-import:errors.database_error" };
    case "ProcedureTypeNotFound":
      return { key: "excel-import:errors.procedure_type_not_found" };
  }
}

/**
 * EXI-151 (#621) — what names a mapped type gone since: its name when the
 * cache still holds it, and the amounts the user mapped to it, so the message
 * points at the rows to map again.
 */
export function goneTypeDetails(
  procedureTypeId: string,
  mapping: Record<string, string>,
  rows: ProcedureMapping[],
  types: ProcedureType[],
): { name: string | null; amounts: number[] } {
  return {
    name: types.find((type) => type.id === procedureTypeId)?.name ?? null,
    amounts: rows.filter((row) => mapping[row.tmp_id] === procedureTypeId).map((row) => row.amount),
  };
}

/**
 * EXI-151 (#621) — the message for a gone type: its name and amounts when
 * known, its amounts alone, or a generic message when no row of the selected
 * sheets uses it. `amounts` is already formatted by the caller.
 */
export function formatGoneTypeError(
  name: string | null,
  amounts: string,
): { key: string; params?: Record<string, string> } {
  if (!amounts) return { key: "excel-import:errors.procedure_type_not_found" };
  if (name) {
    return { key: "excel-import:errors.procedure_type_not_found_named", params: { name, amounts } };
  }
  return { key: "excel-import:errors.procedure_type_not_found_for", params: { amounts } };
}
