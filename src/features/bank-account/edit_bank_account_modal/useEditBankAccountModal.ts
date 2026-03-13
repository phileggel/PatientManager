import { type SyntheticEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BankAccount } from "@/bindings";
import type { SnackbarType } from "@/core/snackbar";
import { updateBankAccount } from "@/features/bank-account/gateway";
import { logger } from "@/lib/logger";
import { BankAccountPresenter } from "../shared/presenter";
import type { BankAccountFormData, FormErrors } from "../shared/types";

type ShowSnackbar = (type: SnackbarType, message: string) => void;

export function useEditBankAccountModal(
  bankAccount: BankAccount | null,
  showSnackbar: ShowSnackbar,
  onClose: () => void,
) {
  const { t } = useTranslation("bank");
  const [formData, setFormData] = useState<BankAccountFormData>(
    bankAccount ? BankAccountPresenter.toFormData(bankAccount) : { name: "", iban: "" },
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);

  // Reset form when bankAccount prop changes
  useEffect(() => {
    if (bankAccount) {
      setFormData(BankAccountPresenter.toFormData(bankAccount));
      setErrors({});
    }
  }, [bankAccount]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = t("account.edit.nameRequired");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    // Clear error for this field as user types
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({
        ...prev,
        [name]: undefined,
      }));
    }
  };

  const handleSubmit = async (e: SyntheticEvent) => {
    e.preventDefault();

    if (!bankAccount || !validateForm()) {
      return;
    }

    const name = formData.name.trim();
    const iban = formData.iban.trim() || null;

    logger.debug("Submitting update bank account form", {
      id: bankAccount.id,
      name,
      iban,
    });
    setLoading(true);

    try {
      const result = await updateBankAccount(bankAccount.id, name, iban);

      if (result.success) {
        logger.info("Bank account updated successfully");
        showSnackbar("success", t("account.edit.success", { name: result.data?.name }));
        onClose();
        // Backend event will trigger useAppInit to refresh data
      } else {
        logger.error("Failed to update bank account", { error: result.error });
        showSnackbar("error", t("account.edit.error", { error: result.error }));
      }
    } catch (error) {
      logger.error("Exception occurred while updating bank account", { error });
      showSnackbar("error", t("account.edit.errorUnknown"));
    } finally {
      setLoading(false);
    }
  };

  return {
    formData,
    errors,
    loading,
    handleChange,
    handleSubmit,
  };
}
