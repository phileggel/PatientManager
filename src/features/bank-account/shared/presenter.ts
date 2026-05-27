import type { BankAccount, BankError } from "@/bindings";
import type { BankAccountFormData, BankAccountRow } from "./types";

/**
 * Layer 3 of the F27 typed-error pipeline: pure code → i18n key mapping for
 * the Bank bounded context. Caller (Layer 4) calls `t(key, params)`. Variants
 * unreachable from the bank-account wire surface (BankEntry / use-case ones)
 * still map to keys so future composites stay typed.
 */
export function formatBankError(err: BankError): {
  key: string;
  params?: Record<string, string | number>;
} {
  switch (err.code) {
    case "BankAccountNameEmpty":
      return { key: "bank:errors.bank_account_name_empty" };
    case "RefundOnlyVariantRejected":
      return { key: "bank:errors.refund_only_variant_rejected" };
    case "AmountNotPositive":
      return { key: "bank:errors.amount_not_positive" };
    case "InvalidTransferDateFormat":
      return { key: "bank:errors.invalid_transfer_date_format" };
    case "IbanAlreadyUsed":
      return { key: "bank:errors.iban_already_used" };
    case "BankAccountNotFound":
      return {
        key: "bank:errors.bank_account_not_found",
        params: { id: err.bank_account_id },
      };
    case "ProtectedCashAccount":
      return { key: "bank:errors.protected_cash_account" };
    case "TransferNotFound":
      return {
        key: "bank:errors.transfer_not_found",
        params: { id: err.bank_transfer_id },
      };
    case "DatabaseError":
      return { key: "bank:errors.database_error" };
  }
}

/**
 * BankAccountPresenter - UI Projection of BankAccount Domain Object
 *
 * Transforms the BankAccount domain model into different UI representations:
 * - toRow: For table display (with sorting/filtering)
 * - toFormData: For form editing (only editable fields)
 *
 * This centralizes field extraction logic and makes transformations reusable
 * across different parts of the application.
 */
export const BankAccountPresenter = {
  /**
   * Transform domain BankAccount to UI row data for table display
   * Extracts display fields and adds UI-specific properties
   */
  toRow(bankAccount: BankAccount): BankAccountRow {
    return {
      rowId: crypto.randomUUID(),
      id: bankAccount.id,
      name: bankAccount.name,
      iban: bankAccount.iban,
    };
  },

  /**
   * Transform domain BankAccount to form data for editing
   * Extracts only the fields that users can edit
   * Used for both initial form setup and resetting the form
   */
  toFormData(bankAccount: BankAccount): BankAccountFormData {
    return {
      name: bankAccount.name || "",
      iban: bankAccount.iban || "",
    };
  },
};
