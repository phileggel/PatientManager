import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/lib/appStore";
import { deleteFund } from "../gateway";
import { FundPresenter } from "../shared/presenter";

/**
 * Hook for FundList component
 * - Reads fund data from store
 * - Applies view-specific toRow() transformation (table format)
 * - Provides deleteFund operation
 *
 * View-dependent: This mapper is specific to how FundList displays data
 */
export function useFundList() {
  const { t } = useTranslation("fund");
  const funds = useAppStore((state) => state.funds);
  const fundsLoading = useAppStore((state) => state.fundsLoading);

  const fundRows = useMemo(() => funds.map((f) => FundPresenter.toRow(f)), [funds]);

  const deleteFundHandler = async (id: string) => {
    const result = await deleteFund(id);
    if (!result.success) {
      throw new Error(result.error || t("action.delete.failedFallback"));
    }
  };

  return {
    fundRows,
    funds,
    loading: fundsLoading,
    deleteFund: deleteFundHandler,
  };
}
