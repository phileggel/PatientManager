import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { addFund } from "@/features/fund/gateway";
import { logger } from "@/infra/logger";
import { toastService } from "@/ui/components/snackbar";
import { formatFundError, fundFieldErrorKeys } from "../shared/presenter";
import type { FormErrors, FundFormData } from "../shared/types";

export function useAddFundPanel() {
  const { t } = useTranslation("fund");
  const { t: tc } = useTranslation("common");

  const [formData, setFormData] = useState<FundFormData>({
    fund_identifier: "",
    name: "",
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

    logger.debug("Submitting add fund form");
    setLoading(true);

    try {
      const result = await addFund(formData.fund_identifier, formData.name);

      if (result.success) {
        logger.info("Fund added successfully");
        setFormData({ fund_identifier: "", name: "" });
        setErrors({});
        toastService.show("success", t("action.add_success", { name: result.data?.name }));
      } else {
        const fieldKeys = fundFieldErrorKeys(result.error);
        if (fieldKeys) {
          setErrors(
            Object.fromEntries(Object.entries(fieldKeys).map(([field, key]) => [field, t(key)])),
          );
          return;
        }
        const { key, params } = formatFundError(result.error);
        logger.error("Failed to add fund", { code: result.error.code });
        toastService.show("error", t("action.add_error", { error: t(key, params) }));
      }
    } catch (error) {
      logger.error("Exception occurred while adding fund", { error });
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
