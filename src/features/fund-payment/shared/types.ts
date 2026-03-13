/**
 * UI representation of fund information in fund-payment context
 * Only includes display fields, no domain-specific properties
 */
export interface FundDisplayData {
  fundIdentifier: string;
  fundName: string;
}

/**
 * UI representation of a fund payment group for table display
 * Transforms domain model (FundPaymentGroup) to UI format
 * - Adds rowId for React keys
 * - Resolves fund name
 */
export interface FundPaymentRow {
  rowId: string;
  id: string;
  fundId: string;
  fundName: string;
  paymentDate: string;
  totalAmount: number;
  procedureCount: number;
}
