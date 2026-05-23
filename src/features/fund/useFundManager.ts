import { useCacheStore } from "@/infra/cache/store";

/**
 * Hook for FundsManager component
 * - Reads fund count from store for display
 */
export function useFundManager() {
  const funds = useCacheStore((state) => state.funds);

  return {
    count: funds.length,
  };
}
