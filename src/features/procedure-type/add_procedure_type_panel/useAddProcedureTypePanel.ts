import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { toastService } from "@/core/snackbar";
import { addProcedureType } from "@/features/procedure-type/gateway";
import { logger } from "@/lib/logger";
import type { FormErrors, ProcedureTypeFormData } from "../shared/types";
import { validateProcedureType } from "../shared/validateProcedureType";

const initialFormData: ProcedureTypeFormData = {
  name: "",
  defaultAmount: "",
  category: "",
};

export function useAddProcedureTypePanel() {
  const { t } = useTranslation("procedure-type");
  const { t: tc } = useTranslation("common");

  const [formData, setFormData] = useState<ProcedureTypeFormData>(initialFormData);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);

  const validateForm = (): boolean => {
    const newErrors = validateProcedureType(formData, {
      nameRequired: t("form.nameRequired"),
      amountRequired: t("form.amountRequired"),
      amountInvalid: t("form.amountInvalid"),
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

    logger.debug("Submitting add procedure type form", {
      name: formData.name.trim(),
      defaultAmount: Number(formData.defaultAmount),
    });
    setLoading(true);

    try {
      const result = await addProcedureType(
        formData.name.trim(),
        Math.round(Number(formData.defaultAmount) * 1000),
        formData.category.trim() || undefined,
      );

      if (result.success) {
        logger.info("Procedure type added successfully");
        toastService.show("success", t("action.addSuccess"));
        setFormData(initialFormData);
        setErrors({});
      } else {
        logger.error("Failed to add procedure type", { error: result.error });
        toastService.show("error", t("action.addError", { error: result.error }));
      }
    } catch (error) {
      logger.error("Exception occurred while adding procedure type", { error });
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
