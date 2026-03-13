import type { PatientFormData } from "./types";

export interface FormErrors {
  name?: string;
  ssn?: string;
}

export interface PatientValidationMessages {
  nameRequired: string;
}

/**
 * Validates patient form data
 * Returns empty object if valid, object with error messages if invalid
 */
export function validatePatient(
  formData: PatientFormData,
  messages: PatientValidationMessages,
): FormErrors {
  const errors: FormErrors = {};

  if (!formData.name.trim()) {
    errors.name = messages.nameRequired;
  }

  return errors;
}
