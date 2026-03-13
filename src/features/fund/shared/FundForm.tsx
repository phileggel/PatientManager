import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { logger } from "@/lib/logger";
import { TextField } from "@/ui/components/field";

interface FundFormProps {
  formData: {
    fund_identifier: string;
    name: string;
  };
  errors?: {
    fund_identifier?: string;
    name?: string;
  };
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  idPrefix?: string;
}

export function FundForm({ formData, errors, handleChange, idPrefix = "fund" }: FundFormProps) {
  const { t } = useTranslation("fund");

  useEffect(() => {
    logger.info("[FundForm] Component mounted");
  }, []);

  return (
    <div className="space-y-6">
      <TextField
        label={t("form.identifier")}
        id={`${idPrefix}-identifier`}
        name="fund_identifier"
        placeholder={t("form.identifierPlaceholder")}
        value={formData.fund_identifier}
        onChange={handleChange}
        error={errors?.fund_identifier}
      />

      <TextField
        label={t("form.name")}
        id={`${idPrefix}-name`}
        name="name"
        placeholder={t("form.namePlaceholder")}
        value={formData.name}
        onChange={handleChange}
        error={errors?.name}
      />
    </div>
  );
}
