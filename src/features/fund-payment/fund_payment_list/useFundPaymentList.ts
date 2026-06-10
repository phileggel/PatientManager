import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Procedure } from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";
import { logger } from "@/infra/logger";
import { toastService } from "@/ui/components/snackbar";
import { deleteFundPaymentGroup, readProceduresByIds } from "../gateway";
import { formatManualManagementError } from "../shared/errorPresenter";
import { FundPaymentPresenter } from "../shared/presenter";

/**
 * Hook for FundPaymentList component
 * - Reads groups from store
 * - Fetches the procedures referenced by group lines so the presenter can
 *   derive the care-period range cell (FPM-360)
 * - Applies view-specific toRow() transformation
 * - Provides delete operation
 */
export function useFundPaymentList() {
  const { t } = useTranslation("fund-payment");
  const funds = useCacheStore((state) => state.funds);
  const groups = useCacheStore((state) => state.fundPaymentGroups);
  const loading = useCacheStore((state) => state.fundPaymentGroupsLoading);

  const [procedures, setProcedures] = useState<Procedure[]>([]);

  // String key (value-stable across re-renders that don't change procedure
  // membership) so the effect doesn't re-fetch when a group's payment_date
  // changes without the procedure set itself changing.
  const procedureIdsKey = useMemo(() => {
    const set = new Set<string>();
    for (const g of groups) for (const l of g.lines) set.add(l.procedure_id);
    return Array.from(set).toSorted().join(",");
  }, [groups]);

  useEffect(() => {
    let cancelled = false;
    const ids = procedureIdsKey ? procedureIdsKey.split(",") : [];
    (async () => {
      const result = await readProceduresByIds(ids);
      if (cancelled) return;
      if (result.success) {
        setProcedures(result.data);
      } else {
        logger.error("[FundPaymentList] Failed to load procedures for care-period range", {
          error: result.error,
        });
        setProcedures([]);
        toastService.show("error", t("list.errors.proceduresFetchFailed"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [procedureIdsKey, t]);

  const proceduresById = useMemo(() => new Map(procedures.map((p) => [p.id, p])), [procedures]);

  const fundPaymentRows = useMemo(
    () => groups.map((g) => FundPaymentPresenter.toRow(g, funds, proceduresById)),
    [groups, funds, proceduresById],
  );

  // Toast-in-hook like the sibling flows (`useEditFundPaymentModal`,
  // `useAddFundPaymentPanel`); returns whether the delete succeeded so the
  // caller can keep the confirmation dialog open for a retry on failure.
  const deleteGroupHandler = async (id: string, fundName: string): Promise<boolean> => {
    const result = await deleteFundPaymentGroup(id);
    if (!result.success) {
      logger.error("[FundPaymentList] Delete fund payment group failed", {
        code: result.error.code,
        groupId: id,
      });
      toastService.show("error", t(formatManualManagementError(result.error).key));
      return false;
    }
    toastService.show("success", t("list.delete.success", { fundName }));
    return true;
  };

  return {
    fundPaymentRows,
    groups,
    loading,
    deleteGroup: deleteGroupHandler,
  };
}
