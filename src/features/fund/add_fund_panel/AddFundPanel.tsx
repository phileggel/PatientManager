import { Building2 } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { FundForm } from "@/features/fund/shared/FundForm";
import { logger } from "@/lib/logger";
import { Button } from "@/ui/components";
import { useAddFundPanel } from "./useAddFundPanel";

export function AddFundPanel() {
  const { t } = useTranslation("fund");

  useEffect(() => {
    logger.info("[AddFundPanel] Component mounted");
  }, []);

  const { formData, errors, loading, handleChange, handleSubmit } = useAddFundPanel();

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <fieldset disabled={loading} className="disabled:opacity-50">
        <FundForm
          formData={formData}
          errors={errors}
          handleChange={handleChange}
          idPrefix="add-fund"
        />
      </fieldset>
      <Button type="submit" variant="primary" loading={loading} icon={<Building2 size={18} />}>
        {loading ? t("action.adding") : t("action.add")}
      </Button>
    </form>
  );
}
