import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { logger } from "@/lib/logger";
import { TextField } from "@/ui/components/field";
import type { PatientFormData } from "./types";

interface PatientFormProps {
  formData: PatientFormData;
  errors?: {
    name?: string;
    ssn?: string;
  };
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  idPrefix?: string;
}

export function PatientForm({
  formData,
  errors,
  handleChange,
  idPrefix = "patient",
}: PatientFormProps) {
  const { t } = useTranslation("patient");

  useEffect(() => {
    logger.info("[PatientForm] Component mounted");
  }, []);

  return (
    <div className="space-y-6">
      <TextField
        label={t("form.name")}
        id={`${idPrefix}-name`}
        name="name"
        placeholder={t("form.namePlaceholder")}
        value={formData.name}
        onChange={handleChange}
        error={errors?.name}
      />

      <TextField
        label={t("form.ssn")}
        id={`${idPrefix}-ssn`}
        name="ssn"
        placeholder={t("form.ssnPlaceholder")}
        value={formData.ssn}
        onChange={handleChange}
        error={errors?.ssn}
      />
    </div>
  );
}
