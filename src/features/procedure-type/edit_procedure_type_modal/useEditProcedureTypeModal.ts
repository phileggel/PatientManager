import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProcedureType } from "@/bindings";
import { toastService } from "@/core/snackbar";
import { logger } from "@/lib/logger";
import { updateProcedureType } from "../gateway";
import { ProcedureTypePresenter } from "../shared/presenter";
import type { FormErrors, ProcedureTypeFormData } from "../shared/types";
import { validateProcedureType } from "../shared/validateProcedureType";

export function useEditProcedureTypeModal(
  procedureType: ProcedureType | null,
  onSuccess?: () => void,
) {
  const { t } = useTranslation("procedure-type");
  const { t: tc } = useTranslation("common");

  const [formData, setFormData] = useState<ProcedureTypeFormData>(
    procedureType
      ? ProcedureTypePresenter.toFormData(procedureType)
      : { name: "", defaultAmount: "", category: "" },
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);

  // Reset form when procedureType prop changes
  useEffect(() => {
    if (procedureType) {
      setFormData(ProcedureTypePresenter.toFormData(procedureType));
      setErrors({});
    }
  }, [procedureType]);

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

    if (!procedureType || !validateForm()) {
      return;
    }

    logger.debug("Submitting update procedure type form", {
      id: procedureType.id,
      name: formData.name.trim(),
      defaultAmount: Number(formData.defaultAmount),
    });
    setLoading(true);

    try {
      const result = await updateProcedureType({
        ...procedureType,
        name: formData.name.trim(),
        default_amount: Math.round(Number(formData.defaultAmount) * 1000),
        category: formData.category.trim() || null,
      });

      if (result.success) {
        logger.info("Procedure type updated successfully");
        toastService.show("success", t("action.updateSuccess", { name: result.data?.name }));
        onSuccess?.();
      } else {
        logger.error("Failed to update procedure type", { error: result.error });
        toastService.show("error", t("action.updateError", { error: result.error }));
      }
    } catch (error) {
      logger.error("Exception occurred while updating procedure type", { error });
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
