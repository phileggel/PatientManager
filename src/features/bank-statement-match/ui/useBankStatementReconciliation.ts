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

type AssignmentCorrection = Extract<
  BankStatementCorrection,
  { type: "AssignGroups" } | { type: "AssignProcedures" }
>;

function isAssignment(c: BankStatementCorrection): c is AssignmentCorrection {
  return c.type === "AssignGroups" || c.type === "AssignProcedures";
}

/** The line ids currently carrying `label` — the scope of a LinkFund cascade. */
function lineIdsForLabel(
  reconciliation: BankStatementReconciliation | null,
  label: string,
): Set<string> {
  return new Set(
    (reconciliation?.lines ?? [])
      .filter((l) => l.credit_line.label === label)
      .map((l) => l.line_id),
  );
}

/**
 * BAS-113/092/066 — compact the STORED correction list before appending
 * `incoming`. The engine's pre-replay filter mirrors these removals
 * server-side, but only stored-list compaction keeps REVERTS safe: a
 * superseded entry left in the list would resurrect when a later correction
 * is reverted (BAS-065 = drop one entry and recompute).
 *
 * - An assignment supersedes any prior assignment of the OTHER kind for its
 *   line (BAS-113 mutual exclusion — same-kind reassignment keeps BAS-062
 *   replace-on-replay semantics) and any prior acknowledgment for its line
 *   (BAS-092 — its implied size changed).
 * - A LinkFund that changes a label's fund (or rejects the label) drops the
 *   AssignProcedures corrections staged under the old fund (BAS-066 —
 *   procedures never cross funds).
 */
function compactForApply(
  list: BankStatementCorrection[],
  incoming: BankStatementCorrection,
  reconciliation: BankStatementReconciliation | null,
): BankStatementCorrection[] {
  if (isAssignment(incoming)) {
    const otherKind = incoming.type === "AssignGroups" ? "AssignProcedures" : "AssignGroups";
    return list.filter(
      (c) =>
        !(
          (c.type === otherKind || c.type === "AcknowledgeRemainder") &&
          c.line_id === incoming.line_id
        ),
    );
  }
  if (incoming.type === "LinkFund") {
    const affected = lineIdsForLabel(reconciliation, incoming.bank_label);
    const fundChangedFor = (lineId: string): boolean => {
      if (incoming.assignment.type === "Rejected") return true;
      const line = reconciliation?.lines.find((l) => l.line_id === lineId);
      return line?.fund_id !== incoming.assignment.fund_id;
    };
    return list.filter(
      (c) =>
        !(c.type === "AssignProcedures" && affected.has(c.line_id) && fundChangedFor(c.line_id)),
    );
  }
  return list;
}

/**
 * BAS-065/066 — remove the reverted entry; reverting a LinkFund additionally
 * drops the dependent AssignProcedures corrections for lines of that label
 * (their procedures would be wrong-fund ineligible once the link is gone).
 */
function compactForRevert(
  list: BankStatementCorrection[],
  index: number,
  reconciliation: BankStatementReconciliation | null,
): BankStatementCorrection[] {
  const removed = list[index];
  let next = list.filter((_, i) => i !== index);
  if (removed?.type === "LinkFund") {
    const affected = lineIdsForLabel(reconciliation, removed.bank_label);
    next = next.filter((c) => !(c.type === "AssignProcedures" && affected.has(c.line_id)));
  }
  return next;
}

export interface UseBankStatementReconciliationReturn {
  reconciliation: BankStatementReconciliation | null;
  corrections: BankStatementCorrection[];
  isBusy: boolean;
  error: BankStatementReconciliationError | null;
  /** Resolves true when the correction was accepted (hosts close their dialog on success only). */
  applyCorrection: (correction: BankStatementCorrection) => Promise<boolean>;
  /** Drop the last rejection message — hosts call it when a dialog is dismissed or changes line. */
  clearError: () => void;
  revertCorrection: (index: number) => Promise<void>;
  validate: () => Promise<number | null>;
}

/**
 * Owns the corrections list and the recomputed draft reconciliation (BAS-062/064/065).
 *
 * - On mount: compute with an empty corrections list.
 * - `applyCorrection`: append, recompute; the correction is only committed and
 *   the draft only advanced when compute succeeds (BAS-064 — a failing
 *   correction leaves the prior draft intact).
 * - `revertCorrection`: drop the i-th correction and recompute (BAS-065); no-op
 *   for an out-of-range index.
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

  // Mirror the committed corrections + latest draft in refs so callbacks read
  // the latest state without re-binding on every change.
  const correctionsRef = useRef<BankStatementCorrection[]>([]);
  correctionsRef.current = corrections;
  const reconciliationRef = useRef<BankStatementReconciliation | null>(null);
  reconciliationRef.current = reconciliation;

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
    async (correction: BankStatementCorrection): Promise<boolean> => {
      const next = [
        ...compactForApply(correctionsRef.current, correction, reconciliationRef.current),
        correction,
      ];
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

  const revertCorrection = useCallback(
    async (index: number) => {
      const current = correctionsRef.current;
      if (index < 0 || index >= current.length) return;
      const next = compactForRevert(current, index, reconciliationRef.current);
      const ok = await recompute(next);
      if (ok) {
        correctionsRef.current = next;
        setCorrections(next);
      }
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
    corrections,
    isBusy,
    error,
    applyCorrection,
    clearError,
    revertCorrection,
    validate,
  };
}
