/**
 * EditPatientModal - Patient Edit Dialog
 *
 * Renders when user clicks "Edit" button in PatientList.
 * On successful update:
 * 1. Calls updatePatient service (sends request to Tauri backend)
 * 2. Backend publishes PatientUpdated event
 * 3. useAppInit (root) listens for event and refetches patients
 * 4. Zustand store updates
 * 5. Modal closes automatically, PatientList re-renders with fresh data
 * 6. Parent receives onSuccess callback to show confirmation toast
 *
 * No manual data refresh needed - event-driven.
 */

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { Patient } from "@/bindings";
import { PatientForm } from "@/features/patient/shared/PatientForm";
import { useAppStore } from "@/lib/appStore";
import { logger } from "@/lib/logger";
import { Button, Dialog } from "@/ui/components";
import { useEditPatientModal } from "./useEditPatientModal";

interface EditPatientModalProps {
  patient: Patient | null;
  isOpen: boolean;
  onClose: () => void;
}

export function EditPatientModal({ patient, isOpen, onClose }: EditPatientModalProps) {
  const { t } = useTranslation("patient");
  const { t: tc } = useTranslation("common");

  // Call hook unconditionally at top level (required by React)
  // Hook returns safe defaults if patient is null
  const funds = useAppStore((state) => state.funds);
  const hookResult = useEditPatientModal(patient, onClose);

  const latestFundLabel = (() => {
    if (!patient?.latest_fund) return null;
    const fund = funds.find((f) => f.id === patient.latest_fund);
    return fund ? `${fund.fund_identifier} (${fund.name})` : patient.latest_fund;
  })();

  useEffect(() => {
    if (isOpen && patient) {
      logger.info("[EditPatientModal] Modal opened", {
        patientId: patient.id,
        patientName: patient.name,
      });
    }
  }, [patient, isOpen]);

  if (!isOpen || !patient) return null;

  const { formData, errors, loading, handleChange, handleSubmit } = hookResult;

  const actions = (
    <>
      <Button type="button" onClick={onClose} variant="secondary" disabled={loading}>
        {tc("action.cancel")}
      </Button>
      <Button type="submit" form="edit-patient-form" variant="primary" loading={loading}>
        {loading ? t("action.updating") : t("action.update")}
      </Button>
    </>
  );

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={t("action.editTitle")} actions={actions}>
      <form id="edit-patient-form" onSubmit={handleSubmit} className="flex flex-col gap-6">
        <fieldset disabled={loading} className="disabled:opacity-50">
          <PatientForm
            formData={formData}
            errors={errors}
            handleChange={handleChange}
            idPrefix="edit-patient"
          />
        </fieldset>

        {/* Latest Procedure Information - read-only section */}
        <div className="border-t border-m3-outline/10 pt-4">
          <h3 className="text-sm font-medium text-m3-on-surface-variant mb-3">
            {t("modal.latestProcedure")}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <div className="text-xs font-medium text-m3-on-surface-variant">
                {t("modal.procedureType")}
              </div>
              <div className="px-4 py-2 rounded-lg bg-m3-surface text-m3-on-surface text-sm">
                {patient.latest_procedure_type || "—"}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-xs font-medium text-m3-on-surface-variant">
                {t("modal.fund")}
              </div>
              <div className="px-4 py-2 rounded-lg bg-m3-surface text-m3-on-surface text-sm">
                {latestFundLabel || "—"}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-xs font-medium text-m3-on-surface-variant">
                {t("modal.date")}
              </div>
              <div className="px-4 py-2 rounded-lg bg-m3-surface text-m3-on-surface text-sm">
                {patient.latest_date || "—"}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-xs font-medium text-m3-on-surface-variant">
                {t("modal.amount")}
              </div>
              <div className="px-4 py-2 rounded-lg bg-m3-surface text-m3-on-surface text-sm">
                {patient.latest_procedure_amount
                  ? `€${(patient.latest_procedure_amount / 1000).toFixed(2)}`
                  : "—"}
              </div>
            </div>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
