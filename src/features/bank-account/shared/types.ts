/**
 * Form data for bank account add/edit forms (BankAccountForm component)
 */
export interface BankAccountFormData {
  name: string;
  iban: string;
}

export type FormErrors = Partial<Record<keyof BankAccountFormData, string>>;

/**
 * UI representation of a bank account for table display
 * Transforms domain model (BankAccount) to UI format
 * - Adds rowId for React keys
 *
 * See BankAccountPresenter in shared/presenter.ts for the transformation logic
 */
export interface BankAccountRow {
  rowId: string;
  id?: string;
  name: string;
  iban?: string | null;
}
