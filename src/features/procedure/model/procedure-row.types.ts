import type { AffiliatedFund, Patient, ProcedureType } from "@/bindings";

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
  "RECONCILIATED",
  "PARTIALLY_RECONCILED",
  "FUND_PAYED",
  "PARTIALLY_FUND_PAYED",
  "DIRECTLY_PAYED",
]);

/**
 * Returns true if the procedure status prevents deletion and editing.
 * These procedures are linked to a payment group or bank transaction.
 */
export function isBlockingStatus(status: string | null): boolean {
  return status != null && BLOCKING_STATUSES.has(status);
}

/**
 * Reference data for populating ProcedureRow
 */
export interface ProcedureRowReferenceData {
  patients: Patient[];
  funds: AffiliatedFund[];
  procedureTypes: ProcedureType[];
}
