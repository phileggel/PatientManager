import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { useCreateEntityForm } from "@/features/procedure/hooks/useCreateEntityForm";
import { logger } from "@/lib/logger";
import { Button, Dialog, TextField } from "@/ui/components";

export interface CreatePatientFormData {
  name: string;
  ssn?: string;
}

interface CreatePatientFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreatePatientFormData) => Promise<void>;
  initialQuery?: string;
}

/**
 * Form fields for patient creation
 */
type PatientFields = {
  name: string;
  ssn: string;
};

/**
 * CreatePatientForm - Presentational component for creating patients
 *
 * Business logic is handled by useCreateEntityForm hook.
 * This component focuses solely on rendering UI.
 */
export function CreatePatientForm({
  isOpen,
  onClose,
  onSubmit,
  initialQuery,
}: CreatePatientFormProps) {
  const { t } = useTranslation("procedure");
  const { t: tc } = useTranslation("common");

  useEffect(() => {
    logger.info("[CreatePatientForm] Component mounted");
  }, []);

  const form = useCreateEntityForm<PatientFields, CreatePatientFormData>({
    entityName: "patient",
    initialFields: {
      name: "",
      ssn: "",
    },
    initialQuery,
    queryField: "name",
    validator: (fields) => {
      const errors: Record<string, string> = {};
      if (!fields.name.trim()) {
        errors.name = t("createPatient.nameRequired");
      }
      return errors;
    },
    toFormData: (fields) => ({
      name: fields.name.trim(),
      ssn: fields.ssn.trim() || undefined,
    }),
    onSubmit,
    onClose,
  });

  const actions = (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={form.handleClose}
        disabled={form.isSubmitting}
      >
        {tc("action.cancel")}
      </Button>
      <Button
        type="submit"
        form="create-patient-form"
        variant="primary"
        loading={form.isSubmitting}
        disabled={!form.fields.name.trim()}
      >
        {t("createPatient.submit")}
      </Button>
    </>
  );

  return (
    <Dialog
      id="procedure-create-patient-dialog"
      isOpen={isOpen}
      onClose={form.handleClose}
      title={t("createPatient.title")}
      actions={actions}
    >
      <form id="create-patient-form" onSubmit={form.handleSubmit} className="flex flex-col gap-4">
        <TextField
          id="patient-name"
          label={t("createPatient.nameLabel")}
          type="text"
          value={form.fields.name}
          onChange={(e) => form.updateField("name", e.target.value)}
          placeholder={t("createPatient.namePlaceholder")}
          required
          error={form.errors.name}
          disabled={form.isSubmitting}
          autoFocus
        />

        <TextField
          id="patient-ssn"
          label={t("createPatient.ssnLabel")}
          type="text"
          value={form.fields.ssn}
          onChange={(e) => form.updateField("ssn", e.target.value)}
          placeholder={t("createPatient.ssnPlaceholder")}
          disabled={form.isSubmitting}
        />

        {form.errors.submit && (
          <div className="p-3 bg-m3-error-container rounded-xl text-m3-on-error-container text-xs font-medium">
            {form.errors.submit}
          </div>
        )}
      </form>
    </Dialog>
  );
}
