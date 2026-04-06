import { useTranslation } from "react-i18next";
import { TextField } from "@/ui/components";
import type { FormErrors, ProcedureTypeFormData } from "./types";

interface ProcedureTypeFormProps {
  formData: ProcedureTypeFormData;
  errors?: FormErrors;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  idPrefix?: string;
}

export function ProcedureTypeForm({
  formData,
  errors,
  handleChange,
  idPrefix = "procedure-type",
}: ProcedureTypeFormProps) {
  const { t } = useTranslation("procedure-type");

  return (
    <div className="space-y-6">
      <TextField
        id={`${idPrefix}-name`}
        label={t("form.name")}
        type="text"
        value={formData.name}
        onChange={handleChange}
        name="name"
        placeholder={t("form.namePlaceholder")}
        error={errors?.name}
        required
      />
      <TextField
        id={`${idPrefix}-defaultAmount`}
        label={t("form.amount")}
        type="number"
        step="0.01"
        min="0"
        value={formData.defaultAmount}
        onChange={handleChange}
        name="defaultAmount"
        placeholder={t("form.amountPlaceholder")}
        error={errors?.defaultAmount}
        required
      />
      <TextField
        id={`${idPrefix}-category`}
        label={t("form.category")}
        type="text"
        value={formData.category}
        onChange={handleChange}
        name="category"
        placeholder={t("form.categoryPlaceholder")}
      />
    </div>
  );
}
