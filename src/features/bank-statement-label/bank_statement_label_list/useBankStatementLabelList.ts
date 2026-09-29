import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  BankFundLabelMapping,
  BankStatementReconciliationError,
  FundAssignment,
} from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";
import { toastService } from "@/ui/components/snackbar";
import {
  deleteBankStatementLabel,
  listBankStatementLabels,
  reassignBankStatementLabel,
} from "../gateway";
import { formatLabelError, toRows } from "../shared/presenter";

/**
 * BAS-041–045 — loads the saved bank statement labels, and reassigns or deletes
 * one. Each change is saved at once: success confirms and reloads; a gone label
 * (BAS-044) is reported and reloads; any other failure is reported and the list
 * stays as it was.
 */
export function useBankStatementLabelList() {
  const { t } = useTranslation("bank");
  const accounts = useCacheStore((s) => s.bankAccounts);
  const funds = useCacheStore((s) => s.funds);
  const [labels, setLabels] = useState<BankFundLabelMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    const result = await listBankStatementLabels();
    if (result.success) {
      setLabels(result.data);
      setLoadFailed(false);
    } else {
      setLoadFailed(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => toRows(labels, accounts, funds), [labels, accounts, funds]);

  const afterChange = useCallback(
    async (
      result: { success: true } | { success: false; error: BankStatementReconciliationError },
      successKey: string,
    ) => {
      if (result.success) {
        toastService.show("success", t(successKey));
        await load();
        return;
      }
      toastService.show("error", t(formatLabelError(result.error).key));
      if (result.error.code === "LabelMappingNotFound") await load();
    },
    [load, t],
  );

  const reassign = useCallback(
    async (id: string, assignment: FundAssignment) => {
      await afterChange(
        await reassignBankStatementLabel(id, assignment),
        "statement_label.reassigned",
      );
    },
    [afterChange],
  );

  const remove = useCallback(
    async (id: string) => {
      await afterChange(await deleteBankStatementLabel(id), "statement_label.deleted");
    },
    [afterChange],
  );

  return { rows, loading, loadFailed, reassign, remove };
}
