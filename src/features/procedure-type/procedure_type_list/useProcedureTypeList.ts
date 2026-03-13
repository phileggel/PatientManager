import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/lib/appStore";
import { deleteProcedureType } from "../gateway";
import { ProcedureTypePresenter } from "../shared/presenter";

/**
 * Hook for ProcedureTypeList component
 * - Reads procedure type data from store
 * - Applies view-specific toRow() transformation (table format)
 * - Provides deleteProcedureType operation
 *
 * View-dependent: This mapper is specific to how ProcedureTypeList displays data
 */
export function useProcedureTypeList() {
  const { t } = useTranslation("procedure-type");
  const procedureTypes = useAppStore((state) => state.procedureTypes);
  const procedureTypesLoading = useAppStore((state) => state.procedureTypesLoading);

  const procedureTypeRows = useMemo(
    () => procedureTypes.map((pt) => ProcedureTypePresenter.toRow(pt)),
    [procedureTypes],
  );

  const deleteProcedureTypeHandler = async (id: string) => {
    const result = await deleteProcedureType(id);
    if (!result.success) {
      throw new Error(result.error || t("action.delete.failedFallback"));
    }
  };

  return {
    procedureTypeRows,
    procedureTypes,
    loading: procedureTypesLoading,
    deleteProcedureType: deleteProcedureTypeHandler,
  };
}
