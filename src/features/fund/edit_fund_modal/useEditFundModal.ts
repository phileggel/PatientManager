import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Fund } from "@/bindings";
import { updateFund } from "@/features/fund/gateway";
import { logger } from "@/infra/logger";
import { toastService } from "@/ui/components/snackbar";
import { FundPresenter, formatFundError, fundFieldErrorKeys } from "../shared/presenter";
import type { FormErrors, FundFormData } from "../shared/types";

export function useEditFundModal(fund: Fund | null, onSuccess?: () => void) {
  const { t } = useTranslation("fund");
  const { t: tc } = useTranslation("common");

  const [formData, setFormData] = useState<FundFormData>(
    fund ? FundPresenter.toFormData(fund) : { fund_identifier: "", name: "" },
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);

  // Reset form when fund prop changes
  useEffect(() => {
    if (fund) {
      setFormData(FundPresenter.toFormData(fund));
      setErrors({});
    }
  }, [fund]);

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

    if (!fund) {
      return;
    }

    logger.debug("Submitting update fund form", { id: fund.id });
    setLoading(true);

    try {
      const result = await updateFund({
        ...fund,
        fund_identifier: formData.fund_identifier,
        name: formData.name,
      });

      if (result.success) {
        logger.info("Fund updated successfully");
        toastService.show("success", t("action.update_success", { name: result.data?.name }));
        onSuccess?.();
      } else {
        const fieldKeys = fundFieldErrorKeys(result.error);
        if (fieldKeys) {
          setErrors(
            Object.fromEntries(Object.entries(fieldKeys).map(([field, key]) => [field, t(key)])),
          );
          return;
        }
        const { key, params } = formatFundError(result.error);
        logger.error("Failed to update fund", { code: result.error.code });
        toastService.show("error", t("action.update_error", { error: t(key, params) }));
      }
    } catch (error) {
      logger.error("Exception occurred while updating fund", { error });
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
