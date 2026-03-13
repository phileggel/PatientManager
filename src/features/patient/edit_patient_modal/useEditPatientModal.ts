import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Patient } from "@/bindings";
import { toastService } from "@/core/snackbar";
import { updatePatient } from "@/features/patient/gateway";
import { logger } from "@/lib/logger";
import { PatientPresenter } from "../shared/presenter";
import type { PatientFormData } from "../shared/types";
import { type FormErrors, validatePatient } from "../shared/validatePatient";

export function useEditPatientModal(patient: Patient | null, onSuccess?: () => void) {
  const { t } = useTranslation("patient");
  const { t: tc } = useTranslation("common");

  const [formData, setFormData] = useState<PatientFormData>(
    patient ? PatientPresenter.toFormData(patient) : { name: "", ssn: "" },
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);

  // Reset form when patient prop changes
  useEffect(() => {
    if (patient) {
      setFormData(PatientPresenter.toFormData(patient));
      setErrors({});
    }
  }, [patient]);

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

    if (!patient || !validateForm()) {
      return;
    }

    logger.debug("Submitting update patient form", {
      id: patient.id,
      name: formData.name.trim(),
    });
    setLoading(true);

    try {
      const result = await updatePatient({
        ...patient,
        name: formData.name.trim(),
        ssn: formData.ssn.trim() || null,
      });

      if (result.success) {
        logger.info("Patient updated successfully");
        toastService.show("success", t("action.updateSuccess", { name: result.data?.name }));
        onSuccess?.();
      } else {
        logger.error("Failed to update patient", { error: result.error });
        toastService.show("error", t("action.updateError", { error: result.error }));
      }
    } catch (error) {
      logger.error("Exception occurred while updating patient", { error });
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
