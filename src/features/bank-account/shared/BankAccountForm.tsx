import { useTranslation } from "react-i18next";
import { TextField } from "@/ui/components/field";
import type { BankAccountFormData } from "./types";

interface BankAccountFormProps {
  formData: BankAccountFormData;
  errors?: {
    name?: string;
    iban?: string;
  };
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  idPrefix?: string;
}

export function BankAccountForm({
  formData,
  errors,
  handleChange,
  idPrefix = "bank-account",
}: BankAccountFormProps) {
  const { t } = useTranslation("bank");

  return (
    <div className="space-y-6">
      <TextField
        label={t("account.form.name")}
        id={`${idPrefix}-name`}
        name="name"
        placeholder={t("account.form.namePlaceholder")}
        value={formData.name}
        onChange={handleChange}
        error={errors?.name}
      />
      <TextField
        label={t("account.form.iban")}
        id={`${idPrefix}-iban`}
        name="iban"
        placeholder={t("account.form.ibanPlaceholder")}
        value={formData.iban}
        onChange={handleChange}
        error={errors?.iban}
      />
    </div>
  );
}
