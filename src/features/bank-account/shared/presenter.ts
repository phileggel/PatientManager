import type { BankAccount } from "@/bindings";
import type { BankAccountFormData, BankAccountRow } from "./types";

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
