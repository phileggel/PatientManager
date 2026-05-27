import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatBankError } from "@/features/bank-account/shared/presenter";
import { logger } from "@/infra/logger";
import { deleteTransferByType, readAllBankTransfers } from "./gateway";
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
 * 2. useCacheSync listens and emits window event
 * 3. useEffect listener catches window event
 * 4. Refetch data from API and update store
 */
export function useBankTransferOperations() {
  const { t } = useTranslation("bank");
  const { transfers, isLoading, error } = useBankTransferController();

  // Translate the typed cache error at render (F27 Layer 4).
  const errorMessage = useMemo(() => {
    if (!error) return null;
    const { key, params } = formatBankError(error);
    return t(key, params);
  }, [error, t]);

  // Initial load on mount
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      const result = await readAllBankTransfers();
      if (!isMounted) return;
      if (result.success && result.data) {
        useBankTransferStore.setState({ transfers: result.data, loading: false });
      } else if (!result.success) {
        // Store the typed error; the consumer translates at render via
        // `formatBankError` + `useTranslation`. This keeps the I/O effect
        // independent of the i18n `t` identity.
        useBankTransferStore.setState({ error: result.error, loading: false });
      }
    };

    useBankTransferStore.setState({ loading: true, error: null });
    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Event listener for real-time updates
  useEffect(() => {
    let isMounted = true;

    const handleUpdate = async () => {
      logger.info("banktransfer_updated event received");
      const result = await readAllBankTransfers();
      if (!isMounted) return;
      if (result.success && result.data) {
        useBankTransferStore.setState({ transfers: result.data });
      }
    };

    window.addEventListener("banktransfer_updated", handleUpdate);
    return () => {
      isMounted = false;
      window.removeEventListener("banktransfer_updated", handleUpdate);
    };
  }, []);

  return {
    transfers,
    isLoading,
    error: errorMessage,
    deleteTransfer: deleteTransferByType,
  };
}
