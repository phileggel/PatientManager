import { useCacheStore } from "@/infra/cache/store";

interface UseBankAccountManagerReturn {
  count: number;
}

export function useBankAccountManager(): UseBankAccountManagerReturn {
  const accounts = useCacheStore((state) => state.bankAccounts);

  return {
    count: accounts.length,
  };
}
