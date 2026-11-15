import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BankStatementCorrection,
  BankStatementParseResult,
  BankStatementReconciliation,
  BankStatementReconciliationError,
} from "@/bindings";
import { logger } from "@/infra/logger";
import {
  computeBankStatementReconciliation,
  validateBankStatementReconciliation,
} from "../gateway";

const TAG = "[useBankStatementReconciliation]";

export interface UseBankStatementReconciliationReturn {
  reconciliation: BankStatementReconciliation | null;
  /** The draft before any correction: the saved links (« Reconnu », #697). */
  initialReconciliation: BankStatementReconciliation | null;
  corrections: BankStatementCorrection[];
  isBusy: boolean;
  error: BankStatementReconciliationError | null;
  /** Resolves true when the correction was accepted (hosts close their dialog on success only). */
  applyCorrection: (correction: BankStatementCorrection) => Promise<boolean>;
  /** Drop the last rejection message — hosts call it when a dialog is dismissed or changes line. */
  clearError: () => void;
  validate: () => Promise<number | null>;
}

/**
 * Owns the corrections list and the recomputed draft reconciliation (BAS-062/064).
 *
 * - On mount: compute with an empty corrections list; that first draft is kept
 *   as `initialReconciliation` (the saved links, #697).
 * - `applyCorrection`: append as made, recompute — the engine replays them in
 *   order, each replacing what an earlier one set (BAS-064A); the correction is
 *   only committed and the draft only advanced when compute succeeds (BAS-064 —
 *   a failing correction leaves the prior draft intact).
 * - `validate`: commit server-side; returns the created BankEntry count or null.
 */
export function useBankStatementReconciliation(
  bankAccountId: string,
  parseResult: BankStatementParseResult,
): UseBankStatementReconciliationReturn {
  const [reconciliation, setReconciliation] = useState<BankStatementReconciliation | null>(null);
  const [initialReconciliation, setInitialReconciliation] =
    useState<BankStatementReconciliation | null>(null);
  const [corrections, setCorrections] = useState<BankStatementCorrection[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<BankStatementReconciliationError | null>(null);

  // Mirror the committed corrections in a ref so callbacks read the latest
  // list without re-binding on every change.
  const correctionsRef = useRef<BankStatementCorrection[]>([]);
  correctionsRef.current = corrections;

  const recompute = useCallback(
    async (nextCorrections: BankStatementCorrection[]): Promise<boolean> => {
      setIsBusy(true);
      setError(null);
      try {
        const result = await computeBankStatementReconciliation(
          bankAccountId,
          parseResult,
          nextCorrections,
        );
        if (!result.success) {
          logger.error(TAG, "Recompute failed", { code: result.error.code });
          setError(result.error);
          return false;
        }
        setReconciliation(result.data);
        if (nextCorrections.length === 0) {
          setInitialReconciliation((current) => current ?? result.data);
        }
        return true;
      } finally {
        setIsBusy(false);
      }
    },
    [bankAccountId, parseResult],
  );

  // Initial compute on mount (BAS-064).
  useEffect(() => {
    void recompute([]);
  }, [recompute]);

  const applyCorrection = useCallback(
    async (correction: BankStatementCorrection): Promise<boolean> => {
      const next = [...correctionsRef.current, correction];
      const ok = await recompute(next);
      if (ok) {
        // Update the ref eagerly so an awaited follow-up correction in the
        // same tick (« Rapprocher avec reliquat » posts two) reads the
        // committed list, not the pre-render snapshot.
        correctionsRef.current = next;
        setCorrections(next);
      }
      return ok;
    },
    [recompute],
  );

  const clearError = useCallback(() => setError(null), []);

  const validate = useCallback(async (): Promise<number | null> => {
    setIsBusy(true);
    setError(null);
    try {
      const result = await validateBankStatementReconciliation(
        bankAccountId,
        parseResult,
        correctionsRef.current,
      );
      if (!result.success) {
        logger.error(TAG, "Validate failed", { code: result.error.code });
        setError(result.error);
        return null;
      }
      return result.data;
    } finally {
      setIsBusy(false);
    }
  }, [bankAccountId, parseResult]);

  return {
    reconciliation,
    initialReconciliation,
    corrections,
    isBusy,
    error,
    applyCorrection,
    clearError,
    validate,
  };
}
