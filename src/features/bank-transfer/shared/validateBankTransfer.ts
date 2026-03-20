export interface BankTransferFormErrors {
  transferDate?: string;
  bankAccount?: string;
  noItemsSelected?: string;
}

export interface BankTransferFormMessages {
  dateRequired: string;
  bankAccountRequired: string;
  noItemsSelected: string;
}

interface BankTransferFormData {
  transferDate: string;
  bankAccount: string;
  hasItems: boolean;
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

  if (!formData.bankAccount?.trim()) {
    errors.bankAccount = messages.bankAccountRequired;
  }

  if (!formData.hasItems) {
    errors.noItemsSelected = messages.noItemsSelected;
  }

  return errors;
}
