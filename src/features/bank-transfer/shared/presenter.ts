import type { BankEntry } from "@/bindings";

const DIRECT_PAYMENT_TYPES: ReadonlySet<BankEntry["transfer_type"]> = new Set([
  "PATIENT_CASH",
  "PATIENT_CHECK",
  "PATIENT_CREDIT_CARD",
]);

/** #642 — the two pages a bank entry received is listed on. */
export type BankEntryKind = "direct" | "fund";

/**
 * #642 — the page that lists a bank entry: a patient's payment by check, card or cash on
 * « Paiements directs », a fund's wire on « Virements de caisse »; an overpayment refund
 * (negative, or an outgoing wire, REF-110) on neither (owner, 2026-11-21).
 */
export function entryKind(entry: BankEntry): BankEntryKind | null {
  if (entry.amount <= 0) return null;
  if (entry.transfer_type === "FUND_WIRE") return "fund";
  return DIRECT_PAYMENT_TYPES.has(entry.transfer_type) ? "direct" : null;
}

/** #642 — the i18n key naming a direct payment's method (« Moyen de paiement »); none for a wire. */
export function paymentMethodKey(type: BankEntry["transfer_type"]): string | null {
  switch (type) {
    case "PATIENT_CHECK":
      return "transfer.type_check";
    case "PATIENT_CREDIT_CARD":
      return "transfer.type_credit_card";
    case "PATIENT_CASH":
      return "transfer.type_cash";
    default:
      return null;
  }
}
