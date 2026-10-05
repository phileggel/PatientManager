import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { addPatient } from "@/features/patient/gateway";
import { logger } from "@/infra/logger";
import { toastService } from "@/ui/components/snackbar";
import { formatPatientError, isNameMissing } from "../shared/presenter";
import type { FormErrors, PatientFormData } from "../shared/types";

export function useAddPatientPanel() {
  const { t } = useTranslation("patient");
  const { t: tc } = useTranslation("common");

  const [formData, setFormData] = useState<PatientFormData>({
    name: "",
    ssn: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);

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

    logger.debug("Submitting add patient form", { hasSsn: !!formData.ssn.trim() });
    setLoading(true);

    try {
      const result = await addPatient(formData.name, formData.ssn);

      if (result.success) {
        logger.info("Patient added successfully");
        setFormData({ name: "", ssn: "" });
        setErrors({});
        toastService.show("success", t("action.add_success", { name: result.data?.name }));
      } else if (isNameMissing(result.error)) {
        setErrors({ name: t("form.name_required") });
      } else {
        const { key, params } = formatPatientError(result.error);
        logger.error("Failed to add patient", { code: result.error.code });
        toastService.show("error", t("action.add_error", { error: t(key, params) }));
      }
    } catch (error) {
      logger.error("Exception occurred while adding patient", { error });
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
