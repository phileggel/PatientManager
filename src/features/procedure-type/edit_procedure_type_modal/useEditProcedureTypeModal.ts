import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProcedureType } from "@/bindings";
import { logger } from "@/infra/logger";
import { toastService } from "@/ui/components/snackbar";
import { updateProcedureType } from "../gateway";
import { formatProcedureError, isNameMissing, ProcedureTypePresenter } from "../shared/presenter";
import type { FormErrors, ProcedureTypeFormData } from "../shared/types";

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

    if (!procedureType) {
      return;
    }

    const amount = ProcedureTypePresenter.toDefaultAmount(formData.defaultAmount);
    if ("errorKey" in amount) {
      setErrors({ defaultAmount: t(amount.errorKey) });
      return;
    }

    logger.debug("Submitting update procedure type form", { id: procedureType.id });
    setLoading(true);

    try {
      const result = await updateProcedureType({
        ...procedureType,
        name: formData.name,
        default_amount: amount.thousandths,
        category: formData.category,
      });

      if (result.success) {
        logger.info("Procedure type updated successfully");
        toastService.show("success", t("action.update_success", { name: result.data?.name }));
        onSuccess?.();
      } else if (isNameMissing(result.error)) {
        setErrors({ name: t("form.name_required") });
      } else {
        const { key, params } = formatProcedureError(result.error);
        logger.error("Failed to update procedure type", { code: result.error.code });
        toastService.show("error", t("action.update_error", { error: t(key, params) }));
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
