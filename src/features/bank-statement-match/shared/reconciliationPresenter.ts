import type {
  BankStatementLine,
  BankStatementLineStatus,
  BankStatementReconciliationError,
} from "@/bindings";
import type { LabelRow } from "./labelRows";

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
 * #692 — tag key for a line: a left-aside line (matched with zero
 * assigned settlement items and an acknowledged remainder) gets its own badge
 * so it never reads as a real match; every other line badges by status.
 */
export function presentLineBadge(line: BankStatementLine): string {
  const leftAside =
    line.status === "Matched" &&
    line.assigned_group_ids.length === 0 &&
    line.assigned_procedure_ids.length === 0 &&
    line.remainder_acknowledged;
  return leftAside ? "bank:reconciliation.status.left_aside" : presentLineStatus(line.status);
}

/**
 * #692 — the tag tone of a line, the import's colour meaning: a line matched
 * with a settlement item is done (green); a left-aside line (BAS-123B) or a
 * rejected one is set aside (grey); every other status needs action (orange).
 */
export function lineTagTone(line: BankStatementLine): "done" | "action" | "aside" {
  switch (line.status) {
    case "Matched":
      return line.assigned_group_ids.length > 0 || line.assigned_procedure_ids.length > 0
        ? "done"
        : "aside";
    case "Rejected":
      return "aside";
    case "NeedsLink":
    case "NeedsGroup":
    case "Partial":
    case "Unresolved":
      return "action";
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
    case "ProcedureNotEligible":
      return { key: "bank:reconciliation.error.procedure_not_eligible" };
    case "ProcedureAlreadyConsumed":
      return { key: "bank:reconciliation.error.procedure_already_consumed" };

    // --- BankStatementReconciliationTask (other use-case guards) ---
    case "NoSepaCreditLines":
    case "HomeDirUnresolved":
    case "PathRejected":
    case "PdfExtractionFailed":
    case "InvalidConfirmedMatchDate":
    case "LineNotFound":
    // BAS-044 — reached only from the label-mapping review screen
    case "LabelMappingNotFound":
    case "DatabaseError":
    // --- BankError ---
    case "BankAccountNameEmpty":
    case "RefundOnlyVariantRejected":
    case "AmountNotPositive":
    case "InvalidTransferDateFormat":
    case "BankEntryInvalid":
    case "IbanAlreadyUsed":
    case "BankAccountNameAlreadyUsed":
    case "BankAccountNotFound":
    case "ProtectedTechnicalAccount":
    case "BankAccountHoldsBankEntries":
    case "TransferNotFound":
    // --- FundError ---
    case "FundInvalid":
    case "FundNotFound":
    case "IdentifierAlreadyUsed":
    case "FundIdEmpty":
    case "TotalAmountNotPositive":
    case "InvalidPaymentDateFormat":
    case "RefundGroupProtected":
    case "FundPaymentGroupIdEmpty":
    case "LineProcedureIdEmpty":
    case "PaymentGroupNotFound":
    case "BankPaymentAlreadyConfirmed":
      return { key: "bank:reconciliation.error.unknown" };
  }
}

/** Where a label's assignment comes from (#692): saved, set in this import, none, ignored. */
export type LabelOrigin = "known" | "new" | "todo" | "ignored";

/**
 * #692, step 2 — each label's origin, the header's counts and the « Continuer »
 * gate. `savedFundIds` holds each label's fund before any correction; a label
 * in `unignored` was switched back on and stays « À associer » until a fund is
 * picked.
 */
export function presentLabelOrigins(
  rows: readonly LabelRow[],
  savedFundIds: ReadonlyMap<string, string | null>,
  unignored: readonly string[],
): { origins: LabelOrigin[]; counts: Record<LabelOrigin, number>; allDecided: boolean } {
  const origins = rows.map((row): LabelOrigin => {
    if (unignored.includes(row.label)) return "todo";
    if (row.isRejected) return "ignored";
    if (!row.fundId) return "todo";
    return savedFundIds.get(row.label) === row.fundId ? "known" : "new";
  });
  const counts: Record<LabelOrigin, number> = { known: 0, new: 0, todo: 0, ignored: 0 };
  for (const origin of origins) counts[origin] += 1;
  return { origins, counts, allDecided: counts.todo === 0 };
}
