/**
 * Form data for procedure type add/edit forms (ProcedureTypeForm component)
 */
export interface ProcedureTypeFormData {
  name: string;
  defaultAmount: string;
  category: string;
}

export type FormErrors = Partial<Record<keyof ProcedureTypeFormData, string>>;

/**
 * UI representation of a procedure type for table display
 * Transforms domain model (ProcedureType) to UI format
 * - Adds rowId for React keys
 *
 * See ProcedureTypePresenter in shared/presenter.ts for the transformation logic
 */
export interface ProcedureTypeRow {
  rowId: string;
  id: string;
  name: string;
  defaultAmount: number;
  category: string | null;
  createdAt?: string;
}
