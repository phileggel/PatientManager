/**
 * EditProcedureTypeModal - Procedure Type Edit Dialog
 *
 * Renders when user clicks "Edit" button in ProcedureTypeList.
 * On successful update:
 * 1. Calls updateProcedureType service (sends request to Tauri backend)
 * 2. Backend publishes ProcedureTypeUpdated event
 * 3. useAppInit (root) listens for event and refetches procedure types
 * 4. Zustand store updates
 * 5. Modal closes automatically, ProcedureTypeList re-renders with fresh data
 * 6. Parent receives onSuccess callback to show confirmation toast
 *
 * No manual data refresh needed - event-driven.
 */

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { ProcedureType } from "@/bindings";
import { logger } from "@/lib/logger";
import { Button, Dialog } from "@/ui/components";
import { ProcedureTypeForm } from "../shared/ProcedureTypeForm";
import { useEditProcedureTypeModal } from "./useEditProcedureTypeModal";

interface EditProcedureTypeModalProps {
  procedureType: ProcedureType | null;
  isOpen: boolean;
  onClose: () => void;
}

export function EditProcedureTypeModal({
  procedureType,
  isOpen,
  onClose,
}: EditProcedureTypeModalProps) {
  const { t } = useTranslation("procedure-type");
  const { t: tc } = useTranslation("common");

  // Call hook unconditionally at top level (required by React)
  // Hook returns safe defaults if procedureType is null
  const hookResult = useEditProcedureTypeModal(procedureType, onClose);

  useEffect(() => {
    if (isOpen && procedureType) {
      logger.info("[EditProcedureTypeModal] Modal opened", {
        procedureTypeId: procedureType.id,
        procedureTypeName: procedureType.name,
      });
    }
  }, [procedureType, isOpen]);

  if (!isOpen || !procedureType) return null;

  const { formData, errors, loading, handleChange, handleSubmit } = hookResult;

  const actions = (
    <>
      <Button type="button" onClick={onClose} variant="secondary" disabled={loading}>
        {tc("action.cancel")}
      </Button>
      <Button type="submit" variant="primary" loading={loading}>
        {loading ? t("action.updating") : t("action.update")}
      </Button>
    </>
  );

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={t("action.editTitle")} actions={actions}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <fieldset disabled={loading} className="disabled:opacity-50">
          <ProcedureTypeForm
            formData={formData}
            errors={errors}
            handleChange={handleChange}
            idPrefix="edit-procedure-type"
          />
        </fieldset>
      </form>
    </Dialog>
  );
}
