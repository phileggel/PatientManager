import { create } from "zustand";
import type { BankEntry, BankError } from "@/bindings";

/**
 * BankTransferStore - On-demand feature-scoped state
 *
 * Only useBankTransferOperations writes to this store.
 * Components read-only via useBankTransferStore() selector.
 *
 * `error` holds the typed `BankError` so the I/O effect does not depend on
 * the i18n `t` identity; consumers translate at render via `formatBankError +
 * useTranslation`.
 */
interface BankTransferStore {
  transfers: BankEntry[];
  loading: boolean;
  error: BankError | null;
}

export const useBankTransferStore = create<BankTransferStore>(() => ({
  transfers: [],
  loading: false,
  error: null,
}));
