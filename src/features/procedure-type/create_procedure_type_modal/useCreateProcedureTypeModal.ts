import { type FormEvent, useEffect, useState } from "react";
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

export function useCreateProcedureTypeModal(isOpen: boolean, onClose: () => void) {
  const { t } = useTranslation("procedure-type");
  const { t: tc } = useTranslation("common");

  const [formData, setFormData] = useState<ProcedureTypeFormData>(initialFormData);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);

  // Reset form when modal is closed
  useEffect(() => {
    if (!isOpen) {
      setFormData(initialFormData);
      setErrors({});
    }
  }, [isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const newErrors = validateProcedureType(formData, {
      nameRequired: t("form.nameRequired"),
      amountRequired: t("form.amountRequired"),
      amountInvalid: t("form.amountInvalid"),
    });
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    logger.debug("Submitting create procedure type form", {
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
        logger.info("Procedure type created successfully");
        toastService.show("success", t("action.addSuccess"));
        onClose();
      } else {
        logger.error("Failed to create procedure type", { error: result.error });
        toastService.show("error", t("action.addError", { error: result.error }));
      }
    } catch (error) {
      logger.error("Exception occurred while creating procedure type", { error });
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
