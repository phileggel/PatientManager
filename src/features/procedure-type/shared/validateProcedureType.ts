import type { FormErrors, ProcedureTypeFormData } from "./types";

export interface ProcedureTypeValidationMessages {
  nameRequired: string;
  amountRequired: string;
  amountInvalid: string;
}

export function validateProcedureType(
  data: ProcedureTypeFormData,
  messages: ProcedureTypeValidationMessages,
): FormErrors {
  const errors: FormErrors = {};

  if (!data.name?.trim()) {
    errors.name = messages.nameRequired;
  }

  if (!data.defaultAmount?.trim()) {
    errors.defaultAmount = messages.amountRequired;
  } else if (Number.isNaN(Number(data.defaultAmount))) {
    errors.defaultAmount = messages.amountInvalid;
  }

  return errors;
}
