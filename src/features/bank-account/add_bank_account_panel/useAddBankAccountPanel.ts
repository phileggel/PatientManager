import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { logger } from "@/lib/logger";
import { toastService } from "@/ui/components/snackbar";
import { createBankAccount } from "../gateway";
import type { BankAccountFormData, FormErrors } from "../shared/types";

interface UseAddBankAccountPanelReturn {
  formData: BankAccountFormData;
  errors: FormErrors;
  loading: boolean;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: FormEvent<HTMLFormElement>) => Promise<void>;
}

export function useAddBankAccountPanel(): UseAddBankAccountPanelReturn {
  const { t } = useTranslation("bank");
  const [formData, setFormData] = useState<BankAccountFormData>({
    name: "",
    iban: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    // Clear error for this field when user starts typing
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({
        ...prev,
        [name]: undefined,
      }));
    }
  };

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = t("account.add.nameRequired");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setLoading(true);

    try {
      const iban = formData.iban.trim() || null;
      const result = await createBankAccount(formData.name.trim(), iban);

      if (result.success) {
        logger.info("Bank account created", { name: formData.name });
        setFormData({ name: "", iban: "" });
        toastService.show("success", t("account.add.success"));
        // Backend event will trigger useAppInit to refresh data
      } else {
        logger.error("Failed to create bank account", { error: result.error });
        const message = result.error || t("account.add.error");
        setErrors({ name: message });
        toastService.show("error", message);
      }
    } catch (err) {
      logger.error("Exception creating bank account", { error: err });
      const message = t("account.add.errorUnknown");
      setErrors({ name: message });
      toastService.show("error", message);
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
