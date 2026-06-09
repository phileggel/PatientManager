import type { BankManualMatchError } from "@/bindings";

/**
 * Layer 3 of the F27 typed-error pipeline for manual bank-transfer matching.
 * Pure `code → { key, params? }` mapping over the untagged composite
 * (`BankError | FundError | ProcedureError | BankManualMatchTask`). The caller
 * (Layer 4) calls `t(key, params)`. No runtime dependency on i18next.
 *
 * Exhaustive over the full union (no `default`), so a new wire variant fails to
 * compile here rather than silently dropping. The use-case guard, the reachable
 * bank/fund lookups, and the shared infra catch-all get specific messages;
 * bounded-context domain invariants that cannot surface in this matching flow
 * map to the generic `unexpected` key. Keys are namespace-qualified so the
 * caller's bound namespace does not matter.
 */
export function formatBankManualMatchError(err: BankManualMatchError): {
  key: string;
  params?: Record<string, string | number>;
} {
  switch (err.code) {
    // --- BankManualMatchTask (use-case guard) ---
    case "WrongTransferType":
      return { key: "bank:errors.wrong_transfer_type" };

    // --- reachable bank-BC errors ---
    case "TransferNotFound":
      return { key: "bank:errors.transfer_not_found", params: { id: err.bank_transfer_id } };
    case "AmountNotPositive":
      return { key: "bank:errors.amount_not_positive" };
    case "InvalidTransferDateFormat":
      return { key: "bank:errors.invalid_transfer_date_format" };
    case "RefundOnlyVariantRejected":
      return { key: "bank:errors.refund_only_variant_rejected" };
    case "BankAccountNotFound":
      return { key: "bank:errors.bank_account_not_found", params: { id: err.bank_account_id } };

    // --- reachable fund-BC lookup ---
    case "PaymentGroupNotFound":
      return {
        key: "bank:errors.payment_group_not_found",
        params: { id: err.fund_payment_group_id },
      };

    // --- shared infra catch-all (Bank/Fund/Procedure all emit this) ---
    case "DatabaseError":
      return { key: "bank:errors.database_error" };

    // --- BankError variants not reachable from this flow ---
    case "BankAccountNameEmpty":
    case "IbanAlreadyUsed":
    case "ProtectedCashAccount":
    // --- FundError domain invariants (not expected in this flow) ---
    case "FundIdentifierEmpty":
    case "FundNameEmpty":
    case "FundIdEmpty":
    case "TotalAmountNotPositive":
    case "InvalidPaymentDateFormat":
    case "FundPaymentGroupIdEmpty":
    case "LineProcedureIdEmpty":
    // --- ProcedureError domain invariants + lookups (not expected in this flow) ---
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
      return { key: "bank:errors.unexpected" };
  }
}
