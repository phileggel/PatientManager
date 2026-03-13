import { useAppStore } from "@/lib/appStore";

/**
 * Hook for FundsManager component
 * - Reads fund count from store for display
 */
export function useFundManager() {
  const funds = useAppStore((state) => state.funds);

  return {
    count: funds.length,
  };
}
