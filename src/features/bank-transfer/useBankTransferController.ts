import { useBankTransferStore } from "./store";

/**
 * Read-only interface to bank transfer store
 * - Reads transfers, loading state, and error
 * - No side effects or operations
 * - Used internally by useBankTransferOperations
 * - Components should use useBankTransferOperations instead
 */
export function useBankTransferController() {
  const transfers = useBankTransferStore((state) => state.transfers);
  const isLoading = useBankTransferStore((state) => state.loading);
  const error = useBankTransferStore((state) => state.error);

  return {
    transfers,
    isLoading,
    error,
  };
}
