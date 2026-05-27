import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useCacheStore } from "@/infra/cache/store";
import { deleteFund } from "../gateway";
import { FundPresenter, formatFundError } from "../shared/presenter";

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
  const funds = useCacheStore((state) => state.funds);
  const fundsLoading = useCacheStore((state) => state.fundsLoading);

  const fundRows = useMemo(() => funds.map((f) => FundPresenter.toRow(f)), [funds]);

  const deleteFundHandler = async (id: string) => {
    const result = await deleteFund(id);
    if (!result.success) {
      const { key, params } = formatFundError(result.error);
      throw new Error(t(key, params) || t("action.delete.failedFallback"));
    }
  };

  return {
    fundRows,
    funds,
    loading: fundsLoading,
    deleteFund: deleteFundHandler,
  };
}
