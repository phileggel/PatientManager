import type { FundPaymentReconciliationError, ReportPdfError } from "@/bindings";

/**
 * Layer 3 of the F27 typed-error pipeline for the fund-payment reconciliation
 * use case. Pure `code → { key, params }` mapping over the untagged composite
 * (`FundError | PatientError | ProcedureError | FundPaymentReconciliationTask`).
 * The caller (Layer 4) calls `t(key, params)`. No runtime dependency on i18next.
 *
 * Exhaustive over the full union (no `default`), so a new wire variant fails to
 * compile here rather than silently dropping. The use-case `Task` guards get
 * specific messages; bounded-context domain invariants that cannot meaningfully
 * surface in this flow map to the generic `unexpected` key, and the shared
 * infra catch-all maps to `database_error`.
 */
export function formatReconciliationError(err: FundPaymentReconciliationError): {
  key: string;
  params?: Record<string, string | number>;
} {
  switch (err.code) {
    // --- FundPaymentReconciliationTask (use-case guards) ---
    case "AllDuplicates":
      return {
        key: "fund-payment-match:errors.already_imported",
        params: { count: err.count },
      };
    case "NoValidCandidates":
      return { key: "fund-payment-match:errors.no_valid_candidates" };
    case "NoValidCandidatesAfterCorrections":
      return { key: "fund-payment-match:errors.no_valid_candidates_after_corrections" };
    case "InvalidDateRange":
      return { key: "fund-payment-match:errors.invalid_date_range" };
    case "PdfPathRejected":
      return { key: "fund-payment-match:errors.pdf_path_rejected" };
    case "PdfExtractionFailed":
      return { key: "fund-payment-match:errors.pdf_extraction_failed" };

    // --- shared infra catch-all (BC enums + Task all share this code) ---
    case "DatabaseError":
      return { key: "fund-payment-match:errors.database_error" };

    // --- FundError domain invariants (not expected in this flow) ---
    case "FundIdentifierEmpty":
    case "FundNameEmpty":
    case "FundIdEmpty":
    case "TotalAmountNotPositive":
    case "InvalidPaymentDateFormat":
    case "FundPaymentGroupIdEmpty":
    case "LineProcedureIdEmpty":
    case "PaymentGroupNotFound":
    // --- PatientError domain invariants ---
    case "NameEmpty":
    case "NonAnonymousRequiresName":
    case "InvalidSsn":
    // --- ProcedureError domain invariants ---
    case "PatientIdEmpty":
    case "ProcedureTypeIdEmpty":
    case "ProcedureNotFound":
    case "ProcedureTypeNameEmpty":
    case "DefaultAmountNegative":
    case "ProcedureTypeNotFound":
    case "ProcedureTypeNameDuplicate":
    case "ReservedTypeNotMutable":
    case "RefundReasonTooLong":
    case "InvalidRefundDateFormat":
      return { key: "fund-payment-match:errors.unexpected" };
  }
}

/**
 * Layer 3 of the F27 pipeline for the report-PDF commands
 * (`generate_fund_reconciliation_report_pdf` /
 * `export_and_open_fund_reconciliation_report_pdf`). The report flow surfaces a
 * single "export failed" toast regardless of cause, so every `ReportPdfError`
 * code maps to one key — but the switch is exhaustive (no `default`), so a new
 * wire variant fails to compile here rather than silently dropping.
 */
export function formatReportPdfError(err: ReportPdfError): { key: string } {
  switch (err.code) {
    case "InvalidRequest":
    case "PdfGenerationFailed":
    case "WriteFailed":
    case "OpenFailed":
      return { key: "fund-payment-match:modal.report.error.exportFailed" };
  }
}
