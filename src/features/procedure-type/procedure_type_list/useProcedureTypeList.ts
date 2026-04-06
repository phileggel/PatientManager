import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/lib/appStore";
import { deleteProcedureType, reloadProcedureTypes } from "../gateway";
import { ProcedureTypePresenter } from "../shared/presenter";
import { RESERVED_PROCEDURE_TYPE_ID } from "../shared/types";

/**
 * Hook for ProcedureTypeList component
 * - Reads procedure type data from store, excluding the reserved import-pdf type
 * - Applies view-specific toRow() transformation (table format)
 * - Provides deleteProcedureType operation, error state, and retry
 */
export function useProcedureTypeList() {
  const { t } = useTranslation("procedure-type");
  const procedureTypes = useAppStore((state) => state.procedureTypes);
  const procedureTypesLoading = useAppStore((state) => state.procedureTypesLoading);
  const procedureTypesError = useAppStore((state) => state.procedureTypesError);
  const setProcedureTypes = useAppStore((state) => state.setProcedureTypes);
  const setProcedureTypesError = useAppStore((state) => state.setProcedureTypesError);
  const setLoading = useAppStore((state) => state.setLoading);

  const visibleProcedureTypes = useMemo(
    () => procedureTypes.filter((pt) => pt.id !== RESERVED_PROCEDURE_TYPE_ID),
    [procedureTypes],
  );

  const procedureTypeRows = useMemo(
    () => visibleProcedureTypes.map((pt) => ProcedureTypePresenter.toRow(pt)),
    [visibleProcedureTypes],
  );

  const retry = useCallback(async () => {
    setLoading("procedureTypes", true);
    const result = await reloadProcedureTypes();
    if (result.success) {
      setProcedureTypes(result.data);
      setProcedureTypesError(null);
    } else {
      setProcedureTypesError(result.error ?? null);
    }
    setLoading("procedureTypes", false);
  }, [setProcedureTypes, setProcedureTypesError, setLoading]);

  const deleteProcedureTypeHandler = useCallback(
    async (id: string) => {
      const result = await deleteProcedureType(id);
      if (!result.success) {
        throw new Error(result.error || t("action.delete.failedFallback"));
      }
    },
    [t],
  );

  return {
    procedureTypeRows,
    procedureTypes: visibleProcedureTypes,
    loading: procedureTypesLoading,
    error: procedureTypesError,
    retry,
    deleteProcedureType: deleteProcedureTypeHandler,
  };
}
