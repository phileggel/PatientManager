import { useBankTransferController } from "./useBankTransferController";

/**
 * Hook for BankTransferManager component
 * - Reads bank transfer count from store for display
 */
export function useBankTransferManager() {
  const { transfers } = useBankTransferController();

  return {
    count: transfers.length,
  };
}
