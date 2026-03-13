import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { toastService } from "@/core/snackbar";
import { addPatient } from "@/features/patient/gateway";
import { logger } from "@/lib/logger";
import type { PatientFormData } from "../shared/types";
import { type FormErrors, validatePatient } from "../shared/validatePatient";

export function useAddPatientPanel() {
  const { t } = useTranslation("patient");
  const { t: tc } = useTranslation("common");

  const [formData, setFormData] = useState<PatientFormData>({
    name: "",
    ssn: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);

  const validateForm = (): boolean => {
    const newErrors = validatePatient(formData, {
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

    logger.debug("Submitting add patient form", {
      name: formData.name.trim(),
      hasSsn: !!formData.ssn.trim(),
    });
    setLoading(true);

    try {
      const result = await addPatient(formData.name.trim(), formData.ssn.trim() || undefined);

      if (result.success) {
        logger.info("Patient added successfully");
        setFormData({ name: "", ssn: "" });
        setErrors({});
        toastService.show("success", t("action.addSuccess", { name: result.data?.name }));
      } else {
        logger.error("Failed to add patient", { error: result.error });
        toastService.show("error", t("action.addError", { error: result.error }));
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
