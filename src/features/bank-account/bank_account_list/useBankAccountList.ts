import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCacheStore } from "@/infra/cache/store";
import { logger } from "@/infra/logger";
import { deleteBankAccount, getCashBankAccountId } from "../gateway";
import { BankAccountPresenter, formatBankError } from "../shared/presenter";

/**
 * Hook for BankAccountList component
 * - Reads bank account data from store
 * - Applies view-specific toRow() transformation (table format)
 * - Provides deleteBankAccount operation
 *
 * View-dependent: This mapper is specific to how BankAccountList displays data
 */
export function useBankAccountList() {
  const { t } = useTranslation("bank");
  const accounts = useCacheStore((state) => state.bankAccounts);
  const bankAccountsLoading = useCacheStore((state) => state.bankAccountsLoading);
  const [cashAccountId, setCashAccountId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    getCashBankAccountId().then((result) => {
      if (!isMounted) return;
      if (result.success) setCashAccountId(result.data);
      else
        logger.error("[useBankAccountList] getCashBankAccountId failed", { error: result.error });
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const bankAccountRows = useMemo(
    () => accounts.map((a) => BankAccountPresenter.toRow(a)),
    [accounts],
  );

  const deleteBankAccountHandler = async (id: string) => {
    const result = await deleteBankAccount(id);
    if (!result.success) {
      const { key, params } = formatBankError(result.error);
      throw new Error(t(key, params));
    }
  };

  return {
    bankAccountRows,
    accounts,
    loading: bankAccountsLoading,
    cashAccountId,
    deleteBankAccount: deleteBankAccountHandler,
  };
}
