export interface PaymentFormErrors {
  fund?: string;
  paymentDate?: string;
  procedures?: string;
}

export interface PaymentFormMessages {
  fundRequired: string;
  paymentDateRequired: string;
  proceduresRequired: string;
}

export function validatePaymentForm(
  selectedFundId: string,
  paymentDate: string,
  hasSelection: boolean,
  validateProcedures: boolean,
  messages: PaymentFormMessages,
): PaymentFormErrors {
  const errors: PaymentFormErrors = {};

  if (!selectedFundId) {
    errors.fund = messages.fundRequired;
  }

  if (!paymentDate) {
    errors.paymentDate = messages.paymentDateRequired;
  }

  if (validateProcedures && !hasSelection) {
    errors.procedures = messages.proceduresRequired;
  }

  return errors;
}
