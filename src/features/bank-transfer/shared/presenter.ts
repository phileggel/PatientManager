import type { BankEntry } from "@/bindings";

const DIRECT_PAYMENT_TYPES: ReadonlySet<BankEntry["transfer_type"]> = new Set([
  "PATIENT_CASH",
  "PATIENT_CHECK",
  "PATIENT_CREDIT_CARD",
]);

/**
 * BAC-056 — the account a bank entry shows: none for a patient's direct payment, which
 * sits on a technical account never shown; a fund wire's or a refund's otherwise. A refund
 * by check or card is the negative entry of a direct type (REF-110) on a `bank` account.
 */
export function entryAccountName(entry: BankEntry): string | null {
  const isDirectPayment = DIRECT_PAYMENT_TYPES.has(entry.transfer_type) && entry.amount > 0;
  return isDirectPayment ? null : entry.bank_account.name;
}
