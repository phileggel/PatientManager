import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Patient } from "@/bindings";
import { updatePatient } from "@/features/patient/gateway";
import { logger } from "@/infra/logger";
import { toastService } from "@/ui/components/snackbar";
import { formatPatientError, isNameMissing, PatientPresenter } from "../shared/presenter";
import type { FormErrors, PatientFormData } from "../shared/types";

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

    if (!patient) {
      return;
    }

    logger.debug("Submitting update patient form", { id: patient.id });
    setLoading(true);

    try {
      const result = await updatePatient({
        ...patient,
        name: formData.name,
        ssn: formData.ssn,
      });

      if (result.success) {
        logger.info("Patient updated successfully");
        toastService.show("success", t("action.update_success", { name: result.data?.name }));
        onSuccess?.();
      } else if (isNameMissing(result.error)) {
        setErrors({ name: t("form.name_required") });
      } else {
        const { key, params } = formatPatientError(result.error);
        logger.error("Failed to update patient", { code: result.error.code });
        toastService.show("error", t("action.update_error", { error: t(key, params) }));
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
