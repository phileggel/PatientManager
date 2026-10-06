import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { addProcedureType } from "@/features/procedure-type/gateway";
import { logger } from "@/infra/logger";
import { toastService } from "@/ui/components/snackbar";
import { formatProcedureError, isNameMissing, ProcedureTypePresenter } from "../shared/presenter";
import type { FormErrors, ProcedureTypeFormData } from "../shared/types";

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

    const amount = ProcedureTypePresenter.toDefaultAmount(formData.defaultAmount);
    if ("errorKey" in amount) {
      setErrors({ defaultAmount: t(amount.errorKey) });
      return;
    }

    logger.debug("Submitting create procedure type form");
    setLoading(true);

    try {
      const result = await addProcedureType(formData.name, amount.thousandths, formData.category);

      if (result.success) {
        logger.info("Procedure type created successfully");
        toastService.show("success", t("action.add_success"));
        onClose();
      } else if (isNameMissing(result.error)) {
        setErrors({ name: t("form.name_required") });
      } else {
        const { key, params } = formatProcedureError(result.error);
        logger.error("Failed to create procedure type", { code: result.error.code });
        toastService.show("error", t("action.add_error", { error: t(key, params) }));
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
