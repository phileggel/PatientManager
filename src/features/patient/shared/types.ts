/**
 * Form data for patient add/edit forms (PatientForm component)
 */
export interface PatientFormData {
  name: string;
  ssn: string;
}

export type FormErrors = Partial<Record<keyof PatientFormData, string>>;

/**
 * UI representation of a patient for table display
 * Transforms domain model (Patient) to UI format
 * - Adds rowId for React keys
 * - Normalizes null fields
 *
 * See PatientPresenter in shared/presenter.ts for the transformation logic
 */
export interface PatientRow {
  rowId: string;
  id?: string;
  name: string | null;
  ssn: string | null;
  latestFund: string | null;
  latestDate: string | null;
  isAnonymous: boolean;
  createdAt?: string;
}
