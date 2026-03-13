interface FundFormData {
  fund_identifier: string;
  name: string;
}

export interface FormErrors {
  fund_identifier?: string;
  name?: string;
}

export interface FundValidationMessages {
  identifierRequired: string;
  nameRequired: string;
}

/**
 * Validates fund form data
 * Returns empty object if valid, object with error messages if invalid
 */
export function validateFund(formData: FundFormData, messages: FundValidationMessages): FormErrors {
  const errors: FormErrors = {};

  if (!formData.fund_identifier.trim()) {
    errors.fund_identifier = messages.identifierRequired;
  }

  if (!formData.name.trim()) {
    errors.name = messages.nameRequired;
  }

  return errors;
}
