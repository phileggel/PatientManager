import { type SyntheticEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BankAccount } from "@/bindings";
import { updateBankAccount } from "@/features/bank-account/gateway";
import { logger } from "@/infra/logger";
import { toastService } from "@/ui/components/snackbar";
import { BankAccountPresenter, formatBankError } from "../shared/presenter";
import type { BankAccountFormData, FormErrors } from "../shared/types";

export function useEditBankAccountModal(bankAccount: BankAccount | null, onClose: () => void) {
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
      newErrors.name = t("account.edit.name_required");
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
        toastService.show("success", t("account.edit.success", { name: result.data?.name }));
        onClose();
        // Backend event will trigger useCacheSync to refresh data
      } else {
        const { key, params } = formatBankError(result.error);
        logger.error("Failed to update bank account", { code: result.error.code });
        toastService.show("error", t("account.edit.error", { error: t(key, params) }));
      }
    } catch (error) {
      logger.error("Exception occurred while updating bank account", { error });
      toastService.show("error", t("account.edit.error_unknown"));
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
