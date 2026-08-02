import type { BankStatementReconciliationError } from "@/bindings";

/**
 * Layer 3 of the F27 typed-error pipeline for bank-statement reconciliation.
 * Pure `code → { key }` mapping over the untagged composite
 * (`BankError | FundError | BankStatementReconciliationTask`). The caller
 * (Layer 4) calls `t(key)`. No runtime dependency on i18next.
 *
 * Exhaustive over the full union (no `default`), so a new wire variant fails to
 * compile here rather than silently dropping. R26's `NoSepaCreditLines` gets the
 * dedicated guidance message; every other code maps to the generic
 * `unknownError` (the workflow surfaces a single error step either way). Keys are
 * namespace-qualified so the caller's bound namespace does not matter.
 */
export function formatBankStatementError(err: BankStatementReconciliationError): { key: string } {
  switch (err.code) {
    // R26 — dedicated "no SEPA lines" guidance.
    case "NoSepaCreditLines":
      return { key: "bank:statement.modal.no_vir_sepa_lines" };

    // --- BankStatementReconciliationTask (other use-case guards) ---
    case "HomeDirUnresolved":
    case "PathRejected":
    case "PdfExtractionFailed":
    case "InvalidConfirmedMatchDate":
    case "DatabaseError":
    // --- BankError (reachable via create_transfer / find_account_by_iban) ---
    case "BankAccountNameEmpty":
    case "RefundOnlyVariantRejected":
    case "AmountNotPositive":
    case "InvalidTransferDateFormat":
    case "IbanAlreadyUsed":
    case "BankAccountNotFound":
    case "ProtectedCashAccount":
    case "TransferNotFound":
    // --- FundError (reachable via read_all_funds / read_all_groups) ---
    case "FundIdentifierEmpty":
    case "FundNameEmpty":
    case "FundIdEmpty":
    case "TotalAmountNotPositive":
    case "InvalidPaymentDateFormat":
    case "FundPaymentGroupIdEmpty":
    case "LineProcedureIdEmpty":
    case "PaymentGroupNotFound":
    // --- draft-engine correction guards (BAS-064/090/094); the reconciliation
    // view maps these to dedicated messages via reconciliationPresenter —
    // this gate-level presenter only needs the generic fallback ---
    case "AssignmentOverflow":
    case "GroupNotEligible":
    case "GroupAlreadyConsumed":
    case "ProcedureNotEligible":
    case "ProcedureAlreadyConsumed":
    case "LineNotFound":
    case "FundNotFound":
      return { key: "bank:statement.modal.unknown_error" };
  }
}
