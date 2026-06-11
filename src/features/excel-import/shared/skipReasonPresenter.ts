import type { SkipReason } from "@/bindings";

/**
 * Pure `code → { key, params? }` mapping for the skip reasons the backend
 * emits on parse-time (EXI-020/220) and execute-time (EXI-280/281/290) row
 * skips. The caller translates via `t(key, params)`.
 *
 * Exhaustive over the union (no `default`), so a new wire variant fails to
 * compile here rather than rendering an untranslated code. Keys are
 * namespace-qualified so the caller's bound namespace does not matter.
 */
export function formatSkipReason(reason: SkipReason): {
  key: string;
  params?: Record<string, string | number>;
} {
  switch (reason.code) {
    case "InsufficientColumns":
      return {
        key: "excel-import:parsingReport.reasons.insufficient_columns",
        params: { needed: reason.needed },
      };
    case "MissingPatientName":
      return { key: "excel-import:parsingReport.reasons.missing_patient_name" };
    case "MissingFundIdentifier":
      return { key: "excel-import:parsingReport.reasons.missing_fund_identifier" };
    case "MissingFundName":
      return { key: "excel-import:parsingReport.reasons.missing_fund_name" };
    case "UnrecognizedDateFormat":
      return {
        key: "excel-import:parsingReport.reasons.unrecognized_date_format",
        params: { value: reason.value },
      };
    case "PatientNotFound":
      return {
        key: "excel-import:parsingReport.reasons.patient_not_found",
        params: { name: reason.name },
      };
    case "FundNotFound":
      return {
        key: "excel-import:parsingReport.reasons.fund_not_found",
        params: { identifier: reason.identifier },
      };
    case "InvalidAmount":
      return {
        key: "excel-import:parsingReport.reasons.invalid_amount",
        params: { value: reason.value },
      };
    case "InvalidProcedureDate":
      return {
        key: "excel-import:parsingReport.reasons.invalid_procedure_date",
        params: { value: reason.value },
      };
    case "InvalidConfirmedPaymentDate":
      return {
        key: "excel-import:parsingReport.reasons.invalid_confirmed_payment_date",
        params: { value: reason.value },
      };
    case "UnknownSheetName":
      return { key: "excel-import:parsingReport.reasons.unknown_sheet_name" };
    case "DateOutsideSheetMonth":
      return {
        key: "excel-import:parsingReport.reasons.date_outside_sheet_month",
        params: { date: reason.date },
      };
  }
}
