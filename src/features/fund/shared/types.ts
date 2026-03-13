/**
 * Form data for fund add/edit forms (FundForm component)
 */
export interface FundFormData {
  fund_identifier: string;
  name: string;
}

export type FormErrors = Partial<Record<keyof FundFormData, string>>;

/**
 * UI representation of a fund for table display
 * Transforms domain model (AffiliatedFund) to UI format
 * - Converts snake_case (domain) to camelCase (UI)
 * - Adds rowId for React keys
 *
 * See FundPresenter in shared/presenter.ts for the transformation logic
 */
export interface FundRow {
  rowId: string;
  fundIdentifier: string | null;
  fundName: string | null;
  id?: string;
  createdAt?: string;
}
