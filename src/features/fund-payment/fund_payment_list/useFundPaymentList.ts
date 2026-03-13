import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/lib/appStore";
import { deleteFundPaymentGroup } from "../gateway";
import { FundPaymentPresenter } from "../shared/presenter";

/**
 * Hook for FundPaymentList component
 * - Reads groups from store
 * - Applies view-specific toRow() transformation
 * - Provides delete operation
 */
export function useFundPaymentList() {
  const { t } = useTranslation("fund-payment");
  const funds = useAppStore((state) => state.funds);
  const groups = useAppStore((state) => state.fundPaymentGroups);
  const loading = useAppStore((state) => state.fundPaymentGroupsLoading);

  const fundPaymentRows = useMemo(
    () => groups.map((g) => FundPaymentPresenter.toRow(g, funds)),
    [groups, funds],
  );

  const deleteGroupHandler = async (id: string) => {
    const result = await deleteFundPaymentGroup(id);
    if (!result.success) {
      throw new Error(result.error || t("list.delete.failedFallback"));
    }
  };

  return {
    fundPaymentRows,
    groups,
    loading,
    deleteGroup: deleteGroupHandler,
  };
}
