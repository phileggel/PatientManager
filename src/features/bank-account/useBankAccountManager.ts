import { useAppStore } from "@/lib/appStore";

interface UseBankAccountManagerReturn {
  count: number;
}

export function useBankAccountManager(): UseBankAccountManagerReturn {
  const accounts = useAppStore((state) => state.bankAccounts);

  return {
    count: accounts.length,
  };
}
