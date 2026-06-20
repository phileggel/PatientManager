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
  corrections: BankStatementCorrection[];
  isBusy: boolean;
  error: BankStatementReconciliationError | null;
  applyCorrection: (correction: BankStatementCorrection) => Promise<void>;
  revert: () => Promise<void>;
  validate: () => Promise<number | null>;
}

/**
 * Owns the corrections list and the recomputed draft reconciliation (BAS-062/064/065).
 *
 * - On mount: compute with an empty corrections list.
 * - `applyCorrection`: append, recompute; the correction is only committed and
 *   the draft only advanced when compute succeeds (BAS-064 — a failing
 *   correction leaves the prior draft intact).
 * - `revert`: drop the last correction and recompute (BAS-065); no-op when empty.
 * - `validate`: commit server-side; returns the created BankEntry count or null.
 */
export function useBankStatementReconciliation(
  bankAccountId: string,
  parseResult: BankStatementParseResult,
): UseBankStatementReconciliationReturn {
  const [reconciliation, setReconciliation] = useState<BankStatementReconciliation | null>(null);
  const [corrections, setCorrections] = useState<BankStatementCorrection[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<BankStatementReconciliationError | null>(null);

  // Mirror the committed corrections in a ref so callbacks read the latest list
  // without re-binding on every change.
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
    async (correction: BankStatementCorrection) => {
      const next = [...correctionsRef.current, correction];
      const ok = await recompute(next);
      if (ok) {
        setCorrections(next);
      }
    },
    [recompute],
  );

  const revert = useCallback(async () => {
    const current = correctionsRef.current;
    if (current.length === 0) return;
    const next = current.slice(0, -1);
    const ok = await recompute(next);
    if (ok) {
      setCorrections(next);
    }
  }, [recompute]);

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

  return { reconciliation, corrections, isBusy, error, applyCorrection, revert, validate };
}
