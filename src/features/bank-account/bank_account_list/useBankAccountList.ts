import { useMemo } from "react";
import { useAppStore } from "@/lib/appStore";
import { deleteBankAccount } from "../gateway";
import { BankAccountPresenter } from "../shared/presenter";

/**
 * Hook for BankAccountList component
 * - Reads bank account data from store
 * - Applies view-specific toRow() transformation (table format)
 * - Provides deleteBankAccount operation
 *
 * View-dependent: This mapper is specific to how BankAccountList displays data
 */
export function useBankAccountList() {
  const accounts = useAppStore((state) => state.bankAccounts);
  const bankAccountsLoading = useAppStore((state) => state.bankAccountsLoading);

  const bankAccountRows = useMemo(
    () => accounts.map((a) => BankAccountPresenter.toRow(a)),
    [accounts],
  );

  const deleteBankAccountHandler = async (id: string) => {
    const result = await deleteBankAccount(id);
    if (!result.success) {
      throw new Error(result.error || "Failed to delete bank account");
    }
  };

  return {
    bankAccountRows,
    accounts,
    loading: bankAccountsLoading,
    deleteBankAccount: deleteBankAccountHandler,
  };
}
