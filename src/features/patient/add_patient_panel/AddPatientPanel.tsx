import { UserPlus } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { PatientForm } from "@/features/patient/shared/PatientForm";
import { logger } from "@/lib/logger";
import { Button } from "@/ui/components";
import { useAddPatientPanel } from "./useAddPatientPanel";

export function AddPatientPanel() {
  const { t } = useTranslation("patient");

  useEffect(() => {
    logger.info("[AddPatientPanel] Component mounted");
  }, []);

  const { formData, errors, loading, handleChange, handleSubmit } = useAddPatientPanel();

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <fieldset disabled={loading} className="disabled:opacity-50">
        <PatientForm
          formData={formData}
          errors={errors}
          handleChange={handleChange}
          idPrefix="add-patient"
        />
      </fieldset>
      <Button type="submit" variant="primary" loading={loading} icon={<UserPlus size={18} />}>
        {loading ? t("action.adding") : t("action.add")}
      </Button>
    </form>
  );
}
