export interface BankTransferFormErrors {
  transferDate?: string;
  amount?: string;
  bankAccount?: string;
  source?: string;
}

export interface BankTransferFormMessages {
  dateRequired: string;
  amountRequired: string;
  amountPositive: string;
  bankAccountRequired: string;
  sourceRequired: string;
}

interface BankTransferFormData {
  transferDate: string;
  amount: string;
  bankAccount: string;
  source: string;
}

/**
 * Validates bank transfer form data
 * Returns empty object if valid, object with error messages if invalid
 */
export function validateBankTransfer(
  formData: BankTransferFormData,
  messages: BankTransferFormMessages,
): BankTransferFormErrors {
  const errors: BankTransferFormErrors = {};

  if (!formData.transferDate?.trim()) {
    errors.transferDate = messages.dateRequired;
  }

  if (!formData.amount?.trim()) {
    errors.amount = messages.amountRequired;
  } else if (parseFloat(formData.amount) <= 0) {
    errors.amount = messages.amountPositive;
  }

  if (!formData.bankAccount?.trim()) {
    errors.bankAccount = messages.bankAccountRequired;
  }

  if (!formData.source?.trim()) {
    errors.source = messages.sourceRequired;
  }

  return errors;
}
