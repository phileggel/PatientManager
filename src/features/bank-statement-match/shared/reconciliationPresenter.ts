import type {
  BankStatementCorrection,
  BankStatementLineStatus,
  BankStatementReconciliationError,
} from "@/bindings";

/** Euros (two decimals) from a thousandths-of-a-euro amount, for inline display. */
export function toEuros(thousandths: number): string {
  return (thousandths / 1000).toFixed(2);
}

/**
 * Pure presenters for the draft-UX reconciliation flow (F27 layer 3).
 *
 * `presentLineStatus` maps the six BAS-061 per-line statuses to namespace-
 * qualified i18n keys; `presentReconciliationError` maps the untagged composite
 * error to a `{ key }` the caller (layer 4) feeds to `t()`. Both are pure: no
 * React, no runtime i18n calls. The switches are exhaustive (no `default`) so a
 * new wire variant fails to compile here rather than silently dropping.
 */

/** BAS-061 — six-status set → status i18n key. */
export function presentLineStatus(status: BankStatementLineStatus): string {
  switch (status) {
    case "Matched":
      return "bank:reconciliation.status.matched";
    case "NeedsLink":
      return "bank:reconciliation.status.needs_link";
    case "NeedsGroup":
      return "bank:reconciliation.status.needs_group";
    case "Partial":
      return "bank:reconciliation.status.partial";
    case "Rejected":
      return "bank:reconciliation.status.rejected";
    case "Unresolved":
      return "bank:reconciliation.status.unresolved";
  }
}

/**
 * Visual tone for a line's status badge: `attention` (gold) for the four
 * correction-needed states so they stand out, `resolved` (subdued) for the two
 * done states (Matched / Rejected). Exhaustive over BAS-061.
 */
export function lineStatusTone(status: BankStatementLineStatus): "attention" | "resolved" {
  switch (status) {
    case "Matched":
    case "Rejected":
      return "resolved";
    case "NeedsLink":
    case "NeedsGroup":
    case "Partial":
    case "Unresolved":
      return "attention";
  }
}

/**
 * BAS-065 — a one-line human description of an applied correction, for the
 * revertable applied-corrections list. Pure: maps each correction variant to a
 * namespace-qualified i18n key plus its interpolation params. Exhaustive over
 * the three correction variants (no `default`) so a new wire variant fails to
 * compile here. `AssignGroups` with an empty set is an unassign override (BAS-062).
 */
export function presentCorrection(correction: BankStatementCorrection): {
  key: string;
  params: Record<string, string | number>;
} {
  switch (correction.type) {
    case "LinkFund":
      return correction.assignment.type === "Rejected"
        ? {
            key: "bank:reconciliation.correction.link_fund_rejected",
            params: { label: correction.bank_label },
          }
        : {
            key: "bank:reconciliation.correction.link_fund",
            params: { label: correction.bank_label },
          };
    case "AssignGroups":
      return correction.group_ids.length === 0
        ? {
            key: "bank:reconciliation.correction.unassign_groups",
            params: { line: correction.line_id },
          }
        : {
            key: "bank:reconciliation.correction.assign_groups",
            params: { line: correction.line_id, count: correction.group_ids.length },
          };
    case "AcknowledgeRemainder":
      return {
        key: "bank:reconciliation.correction.acknowledge_remainder",
        params: { line: correction.line_id },
      };
  }
}

/**
 * Draft-engine correction guards get dedicated guidance (BAS-090/094/067); every
 * other code (BC errors + infra catch-all + other use-case guards) maps to the
 * generic unknown key — the workflow surfaces a single inline error either way.
 */
export function presentReconciliationError(err: BankStatementReconciliationError): { key: string } {
  switch (err.code) {
    // --- draft-engine correction guards (dedicated guidance) ---
    case "AssignmentOverflow":
      return { key: "bank:reconciliation.error.assignment_overflow" };
    case "GroupNotEligible":
      return { key: "bank:reconciliation.error.group_not_eligible" };
    case "GroupAlreadyConsumed":
      return { key: "bank:reconciliation.error.group_already_consumed" };

    // --- BankStatementReconciliationTask (other use-case guards) ---
    case "NoSepaCreditLines":
    case "HomeDirUnresolved":
    case "PathRejected":
    case "PdfExtractionFailed":
    case "InvalidConfirmedMatchDate":
    case "LineNotFound":
    case "FundNotFound":
    case "DatabaseError":
    // --- BankError ---
    case "BankAccountNameEmpty":
    case "RefundOnlyVariantRejected":
    case "AmountNotPositive":
    case "InvalidTransferDateFormat":
    case "IbanAlreadyUsed":
    case "BankAccountNotFound":
    case "ProtectedCashAccount":
    case "TransferNotFound":
    // --- FundError ---
    case "FundIdentifierEmpty":
    case "FundNameEmpty":
    case "FundIdEmpty":
    case "TotalAmountNotPositive":
    case "InvalidPaymentDateFormat":
    case "FundPaymentGroupIdEmpty":
    case "LineProcedureIdEmpty":
    case "PaymentGroupNotFound":
      return { key: "bank:reconciliation.error.unknown" };
  }
}
