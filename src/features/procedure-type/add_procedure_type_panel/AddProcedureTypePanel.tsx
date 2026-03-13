import { Zap } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { logger } from "@/lib/logger";
import { Button } from "@/ui/components";
import { ProcedureTypeForm } from "../shared/ProcedureTypeForm";
import { useAddProcedureTypePanel } from "./useAddProcedureTypePanel";

export function AddProcedureTypePanel() {
  const { t } = useTranslation("procedure-type");

  useEffect(() => {
    logger.info("[AddProcedureTypePanel] Component mounted");
  }, []);
  const { formData, errors, loading, handleChange, handleSubmit } = useAddProcedureTypePanel();

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <fieldset disabled={loading} className="disabled:opacity-50">
        <ProcedureTypeForm
          formData={formData}
          errors={errors}
          handleChange={handleChange}
          idPrefix="add-procedure-type"
        />
      </fieldset>
      <Button type="submit" variant="primary" loading={loading} icon={<Zap size={18} />}>
        {loading ? t("action.adding") : t("action.add")}
      </Button>
    </form>
  );
}
