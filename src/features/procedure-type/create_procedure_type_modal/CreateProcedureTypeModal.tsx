import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { logger } from "@/infra/logger";
import { Button, Dialog } from "@/ui/components";
import { ProcedureTypeForm } from "../shared/ProcedureTypeForm";
import { useCreateProcedureTypeModal } from "./useCreateProcedureTypeModal";

interface CreateProcedureTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateProcedureTypeModal({ isOpen, onClose }: CreateProcedureTypeModalProps) {
  const { t } = useTranslation("procedure-type");
  const { t: tc } = useTranslation("common");

  const { formData, errors, loading, handleChange, handleSubmit } = useCreateProcedureTypeModal(
    isOpen,
    onClose,
  );

  const isFormValid =
    formData.name.trim().length > 0 &&
    formData.defaultAmount !== "" &&
    Number(formData.defaultAmount) >= 0;

  useEffect(() => {
    if (isOpen) {
      logger.info("CreateProcedureTypeModal opened");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const actions = (
    <>
      <Button type="button" onClick={onClose} variant="secondary" disabled={loading}>
        {tc("action.cancel")}
      </Button>
      <Button
        type="submit"
        form="create-procedure-type-form"
        variant="primary"
        loading={loading}
        disabled={loading || !isFormValid}
      >
        {loading ? t("action.adding") : t("action.add")}
      </Button>
    </>
  );

  return (
    <Dialog
      id="create-procedure-type-modal"
      isOpen={isOpen}
      onClose={onClose}
      title={t("action.addTitle")}
      actions={actions}
    >
      <form id="create-procedure-type-form" onSubmit={handleSubmit} className="flex flex-col gap-6">
        <fieldset disabled={loading} className="disabled:opacity-50">
          <ProcedureTypeForm
            formData={formData}
            errors={errors}
            handleChange={handleChange}
            idPrefix="create-procedure-type"
          />
        </fieldset>
      </form>
    </Dialog>
  );
}
