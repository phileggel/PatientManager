import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { toastService } from "@/core/snackbar";
import { addFund } from "@/features/fund/gateway";
import { logger } from "@/lib/logger";
import type { FundFormData } from "../shared/types";
import { type FormErrors, validateFund } from "../shared/validateFund";

export function useAddFundPanel() {
  const { t } = useTranslation("fund");
  const { t: tc } = useTranslation("common");

  const [formData, setFormData] = useState<FundFormData>({
    fund_identifier: "",
    name: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);

  const validateForm = (): boolean => {
    const newErrors = validateFund(formData, {
      identifierRequired: t("form.identifierRequired"),
      nameRequired: t("form.nameRequired"),
    });
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    logger.debug("Submitting add fund form", {
      fund_identifier: formData.fund_identifier.trim(),
      name: formData.name.trim(),
    });
    setLoading(true);

    try {
      const result = await addFund(formData.fund_identifier.trim(), formData.name.trim());

      if (result.success) {
        logger.info("Fund added successfully");
        setFormData({ fund_identifier: "", name: "" });
        setErrors({});
        toastService.show("success", t("action.addSuccess", { name: result.data?.name }));
      } else {
        logger.error("Failed to add fund", { error: result.error });
        toastService.show("error", t("action.addError", { error: result.error }));
      }
    } catch (error) {
      logger.error("Exception occurred while adding fund", { error });
      toastService.show("error", tc("error.unknown"));
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
