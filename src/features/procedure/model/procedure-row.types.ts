import type { Fund, Patient, ProcedureStatus, ProcedureType } from "@/bindings";

export interface ProcedureRow {
  // Ui metadata
  rowId: string; // Unique identifier for the row in the UI
  isDraft: boolean; // Indicates if the row is newly created and not yet saved
  draftPeriod: string | null; // Period (YYYY-MM) this draft belongs to, for filtering purposes

  // Patient data
  patientId: string | null; // Database ID of the patient
  patientName: string | null;
  ssn: string | null;

  // Fund data
  fundId: string | null; // Database ID of the fund
  fundIdentifier: string | null;
  fundName: string | null;

  // Procedure data
  procedureTypeId: string | null; // Database ID of the Procedure type
  procedureName: string | null;
  procedureDate: string | null;
  billedAmount: number;

  // Payment data (readonly)
  paymentMethod: string | null; // NONE | CASH | CHECK | BANK_CARD | BANK_TRANSFER
  // Stage 1 — fund-document payment date (set by fund-payment-* reconciliation flows).
  fundReconciliationDate: string | null;
  // Stage 2 — bank-side confirmed payment date.
  confirmedPaymentDate: string | null;
  paidAmount: number | null;
  awaitedAmount: number | null;
  status: string | null;

  // PRO-310 — derived UI flag: true when this CREATED procedure predates the
  // global reconciliation high-water mark. Emphasis only; never persisted.
  isOverdue: boolean;

  // Procedure database ID
  id?: string;
}

// Statuses where payment has occurred. Used to fall back to billedAmount when
// paid_amount is null on a paid procedure.
const PAID_STATUSES = new Set<ProcedureStatus>([
  "RECONCILED",
  "FUND_PAID",
  "DIRECTLY_PAID",
  "IMPORT_DIRECTLY_PAID",
  "IMPORT_FUND_PAID",
]);

/** Returns true if payment has occurred for this procedure status. */
export function isPaidStatus(status: string | null): boolean {
  return status != null && PAID_STATUSES.has(status as ProcedureStatus);
}

const BLOCKING_STATUSES = new Set([
  "RECONCILED",
  "PARTIALLY_RECONCILED",
  "FUND_PAID",
  "PARTIALLY_FUND_PAID",
  "DIRECTLY_PAID",
  "OVERPAID",
  "OVERPAYMENT_REFUND",
]);

/**
 * Returns true if the procedure status prevents deletion and editing.
 * These procedures are linked to a payment group or bank transaction.
 */
export function isBlockingStatus(status: string | null): boolean {
  return status != null && BLOCKING_STATUSES.has(status);
}

/** Returns true if the procedure is a source that has been overpaid (REF-160). */
export function isOverpaidStatus(status: string | null): boolean {
  return status === "OVERPAID";
}

/** Returns true if the procedure is the mirror refund procedure (REF-090). */
export function isOverpaymentRefundStatus(status: string | null): boolean {
  return status === "OVERPAYMENT_REFUND";
}

// PRO-310 — statuses that count as fund-reconciled for the overdue high-water
// mark. Direct payments (`DIRECTLY_PAID`, `IMPORT_DIRECTLY_PAID`) and the
// overpayment end-states (`OVERPAID`, `OVERPAYMENT_REFUND`) are deliberately
// excluded — they do not define the normal fund-payment frontier.
const FUND_RECONCILED_STATUSES = new Set<ProcedureStatus>([
  "RECONCILED",
  "PARTIALLY_RECONCILED",
  "FUND_PAID",
  "PARTIALLY_FUND_PAID",
  "IMPORT_FUND_PAID",
]);

/** Returns true if the procedure has been fund-reconciled (PRO-310). */
export function isFundReconciledStatus(status: string | null): boolean {
  return status != null && FUND_RECONCILED_STATUSES.has(status as ProcedureStatus);
}

/**
 * Reference data for populating ProcedureRow
 */
export interface ProcedureRowReferenceData {
  patients: Patient[];
  funds: Fund[];
  procedureTypes: ProcedureType[];
}
