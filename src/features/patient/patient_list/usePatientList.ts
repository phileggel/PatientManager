import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/lib/appStore";
import { deletePatient } from "../gateway";
import { PatientPresenter } from "../shared/presenter";

/**
 * Hook for PatientList component
 * - Reads patient data from store
 * - Applies view-specific toRow() transformation (table format)
 * - Provides deletePatient operation
 *
 * View-dependent: This mapper is specific to how PatientList displays data
 */
export function usePatientList() {
  const { t } = useTranslation("patient");
  const patients = useAppStore((state) => state.patients);
  const patientsLoading = useAppStore((state) => state.patientsLoading);
  const funds = useAppStore((state) => state.funds);

  const patientRows = useMemo(
    () => patients.map((p) => PatientPresenter.toRow(p, funds)),
    [patients, funds],
  );

  const deletePatientHandler = async (id: string) => {
    const result = await deletePatient(id);
    if (!result.success) {
      throw new Error(result.error || t("action.delete.failedFallback"));
    }
  };

  return {
    patientRows,
    patients,
    loading: patientsLoading,
    deletePatient: deletePatientHandler,
  };
}
