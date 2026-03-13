import { create } from "zustand";
import type { BankTransfer } from "@/bindings";

/**
 * BankTransferStore - On-demand feature-scoped state
 *
 * Only useBankTransferOperations writes to this store.
 * Components read-only via useBankTransferStore() selector.
 */
interface BankTransferStore {
  transfers: BankTransfer[];
  loading: boolean;
  error: string | null;
}

export const useBankTransferStore = create<BankTransferStore>(() => ({
  transfers: [],
  loading: false,
  error: null,
}));
