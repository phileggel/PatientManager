import type { OverpaymentError } from "@/bindings";

/**
 * Layer 3 of the F27 typed-error pipeline for the overpayment use case.
 * Pure `code → { key, params }` mapping over the untagged composite
 * (`ProcedureError | OverpaymentTask`). The caller (Layer 4) calls
 * `t(key, params)`. No runtime dependency on i18next.
 *
 * Exhaustive over the full union. ProcedureError variants unreachable from
 * the overpayment wire surface (type/patient domain invariants) map to the
 * generic `database_error` key.
 */
export function formatOverpaymentError(err: OverpaymentError): {
  key: string;
  params?: Record<string, string | number>;
} {
  switch (err.code) {
    // --- OverpaymentTask (use-case guards) ---
    case "SourceProcedureNotFound":
      return { key: "overpayment:errors.source_procedure_not_found" };
    case "SourceNotRefundable":
      return { key: "overpayment:errors.source_not_refundable" };
    case "InvalidRefundDate":
      return { key: "overpayment:errors.invalid_refund_date" };
    case "ReasonTooLong":
      return { key: "overpayment:errors.reason_too_long" };
    case "TransferTypeRejected":
      return { key: "overpayment:errors.transfer_type_rejected" };
    case "BankAccountRequired":
      return { key: "overpayment:errors.bank_account_required" };
    case "BankAccountNotFound":
      return { key: "overpayment:errors.bank_account_not_found" };
    case "SourceHasNoFund":
      return { key: "overpayment:errors.source_has_no_fund" };
    case "RefundGroupProtected":
      return { key: "overpayment:errors.refund_group_protected" };
    case "RefundRecordNotFound":
      return { key: "overpayment:errors.refund_record_not_found" };
    // --- ProcedureError (BC) variants reachable via composite ---
    case "ProcedureNotFound":
      return { key: "overpayment:errors.source_procedure_not_found" };
    case "InvalidRefundDateFormat":
      return { key: "overpayment:errors.invalid_refund_date" };
    case "RefundReasonTooLong":
      return { key: "overpayment:errors.reason_too_long" };
    // --- shared infra + ProcedureError domain invariants (not reachable from overpayment) ---
    case "DatabaseError":
    case "PatientIdEmpty":
    case "ProcedureTypeIdEmpty":
    case "ProcedureTypeNameEmpty":
    case "DefaultAmountNegative":
    case "ProcedureTypeNotFound":
    case "ProcedureTypeNameDuplicate":
    case "ReservedTypeNotMutable":
      return { key: "overpayment:errors.database_error" };
  }
}
