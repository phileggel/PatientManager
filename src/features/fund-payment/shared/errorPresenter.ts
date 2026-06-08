import type { FundPaymentManualManagementError } from "@/bindings";

/**
 * Layer 3 of the F27 typed-error pipeline for manual fund-payment management.
 * Pure `code → { key }` mapping over the untagged composite
 * (`FundError | ProcedureError | FundPaymentManualManagementTask`). The caller
 * (Layer 4) calls `t(key)`. No runtime dependency on i18next.
 *
 * Exhaustive over the full union (no `default`), so a new wire variant fails to
 * compile here rather than silently dropping. The use-case guards + the two
 * reachable BC lookups get specific messages; bounded-context domain invariants
 * that cannot meaningfully surface in this CRUD flow map to the generic
 * `unexpected` key, and the shared infra catch-all maps to `database_error`.
 */
export function formatManualManagementError(err: FundPaymentManualManagementError): {
  key: string;
} {
  switch (err.code) {
    // --- FundPaymentManualManagementTask (use-case guards) ---
    case "GroupLocked":
      return { key: "fund-payment:errors.group_locked" };
    case "RefundGroupProtected":
      return { key: "fund-payment:errors.refund_group_protected" };

    // --- reachable BC lookups ---
    case "PaymentGroupNotFound":
      return { key: "fund-payment:errors.group_not_found" };
    case "InvalidPaymentDateFormat":
      return { key: "fund-payment:errors.invalid_payment_date" };

    // --- shared infra catch-all (BC enums + Task all share this code) ---
    case "DatabaseError":
      return { key: "fund-payment:errors.database_error" };

    // --- FundError domain invariants (not expected in this flow) ---
    case "FundIdentifierEmpty":
    case "FundNameEmpty":
    case "FundIdEmpty":
    case "TotalAmountNotPositive":
    case "FundPaymentGroupIdEmpty":
    case "LineProcedureIdEmpty":
    // --- ProcedureError domain invariants (not expected in this flow) ---
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
      return { key: "fund-payment:errors.unexpected" };
  }
}
