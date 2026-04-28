import type { Fund, Patient, ProcedureType } from "@/bindings";

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
  procedureAmount: number | null;
  /**
   * Billed amount actually used for aggregations (received / awaited totals).
   * Falls back to the procedure type's `default_amount` when `procedureAmount`
   * is null. Display sites (table cell, edit modal) keep using `procedureAmount`
   * so unset values stay visible as "—" / empty input.
   */
  effectiveAmount: number | null;

  // Payment data (readonly)
  paymentMethod: string | null; // NONE | CASH | CHECK | BANK_CARD | BANK_TRANSFER
  confirmedPaymentDate: string | null;
  actualPaymentAmount: number | null;
  awaitedAmount: number | null;
  status: string | null;

  // Procedure database ID
  id?: string;
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

/**
 * Reference data for populating ProcedureRow
 */
export interface ProcedureRowReferenceData {
  patients: Patient[];
  funds: Fund[];
  procedureTypes: ProcedureType[];
}
