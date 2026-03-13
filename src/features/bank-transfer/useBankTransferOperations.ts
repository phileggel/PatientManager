import { useEffect } from "react";
import { logger } from "@/lib/logger";
import { deleteBankTransfer, readAllBankTransfers } from "./gateway";
import { useBankTransferStore } from "./store";
import { useBankTransferController } from "./useBankTransferController";

/**
 * Orchestrates bank transfer data operations and event listening
 * - Initializes bank transfer data on mount
 * - Sets up event listener for real-time updates
 * - Provides operation methods (delete, etc.)
 * - Uses controller for read-only store access
 *
 * Event flow:
 * 1. Backend publishes banktransfer_updated event
 * 2. useAppInit listens and emits window event
 * 3. useEffect listener catches window event
 * 4. Refetch data from API and update store
 */
export function useBankTransferOperations() {
  const { transfers, isLoading, error } = useBankTransferController();

  // Initial load on mount
  useEffect(() => {
    const loadData = async () => {
      const result = await readAllBankTransfers();
      if (result.success && result.data) {
        useBankTransferStore.setState({ transfers: result.data, loading: false });
      } else {
        useBankTransferStore.setState({ error: result.error || "Failed to load", loading: false });
      }
    };

    useBankTransferStore.setState({ loading: true, error: null });
    loadData();
  }, []);

  // Event listener for real-time updates
  useEffect(() => {
    const handleUpdate = async () => {
      logger.info("banktransfer_updated event received");
      const result = await readAllBankTransfers();
      if (result.success && result.data) {
        useBankTransferStore.setState({ transfers: result.data });
      }
    };

    window.addEventListener("banktransfer_updated", handleUpdate);
    return () => window.removeEventListener("banktransfer_updated", handleUpdate);
  }, []);

  // Operation handlers
  const handleDeleteBankTransfer = async (id: string) => {
    const result = await deleteBankTransfer(id);
    if (!result.success) {
      throw new Error(result.error || "Failed to delete bank transfer");
    }
  };

  return {
    transfers,
    isLoading,
    error,
    deleteBankTransfer: handleDeleteBankTransfer,
  };
}
