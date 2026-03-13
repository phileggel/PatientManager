/**
 * Hook for ReconciliationResults.
 * Computes resolved issue count, navigation state (step-by-step), and sorted issue list.
 * Reports resolved count upward via onReportResolvedCount.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AutoCorrection, ReconciliationMatch, ReconciliationResult } from "@/bindings";
import {
  buildContestKey,
  buildCorrectionKey,
  buildLinkProcedureKey,
  buildNotFoundKey,
  sortIssuesByPriority,
} from "../shared/utils";

export function useReconciliationResults(
  result: ReconciliationResult,
  acceptedKeys: Set<string>,
  autoCorrections: Map<string, AutoCorrection>,
  onReportResolvedCount?: (count: number) => void,
  onReportUnresolvedGroupCount?: (count: number) => void,
) {
  // Sorted list of actionable issues (perfect matches excluded)
  const sortedIssues = useMemo(() => sortIssuesByPriority(result.matches), [result.matches]);

  const [currentIndex, setCurrentIndex] = useState(0);

  // Keep index in bounds when issues list changes
  useEffect(() => {
    if (currentIndex >= sortedIssues.length && sortedIssues.length > 0) {
      setCurrentIndex(sortedIssues.length - 1);
    }
  }, [sortedIssues.length, currentIndex]);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, sortedIssues.length - 1));
  }, [sortedIssues.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }, []);

  const goTo = useCallback(
    (index: number) => {
      setCurrentIndex(Math.max(0, Math.min(index, sortedIssues.length - 1)));
    },
    [sortedIssues.length],
  );

  const isResolved = useCallback(
    (match: ReconciliationMatch): boolean => {
      if (match.type === "NotFoundIssue") {
        return (
          acceptedKeys.has(buildNotFoundKey(match.data.pdf_line)) ||
          match.data.nearby_candidates.some((c) =>
            acceptedKeys.has(buildLinkProcedureKey(c.procedure_id)),
          )
        );
      }

      if (match.type === "SingleMatchIssue") {
        const { pdf_line, db_match } = match.data;
        const contested = acceptedKeys.has(buildContestKey(db_match.procedure_id));
        const allAnomaliesResolved = db_match.anomalies.every((a) => {
          if (a === "AmountMismatch")
            return acceptedKeys.has(buildCorrectionKey(a, db_match.procedure_id)) || contested;
          return acceptedKeys.has(buildCorrectionKey(a, db_match.procedure_id));
        });
        const corr = autoCorrections.get(
          buildCorrectionKey("AmountMismatch", db_match.procedure_id),
        );
        const amount =
          corr && "AmountMismatch" in corr ? corr.AmountMismatch.pdf_amount : db_match.amount || 0;
        const amountOk = contested || pdf_line.amount === amount;
        return allAnomaliesResolved && amountOk;
      }

      if (match.type === "GroupMatchIssue") {
        const { pdf_line, db_matches } = match.data;
        const allContested = db_matches.every((m) =>
          acceptedKeys.has(buildContestKey(m.procedure_id)),
        );
        const allAnomaliesAccepted = db_matches.every((m) =>
          m.anomalies.every((a) => {
            if (a === "AmountMismatch")
              return (
                acceptedKeys.has(buildCorrectionKey(a, m.procedure_id)) ||
                acceptedKeys.has(buildContestKey(m.procedure_id))
              );
            return acceptedKeys.has(buildCorrectionKey(a, m.procedure_id));
          }),
        );
        const currentTotal = db_matches.reduce((sum, m) => {
          const key = buildCorrectionKey("AmountMismatch", m.procedure_id);
          const corr = autoCorrections.get(key);
          return (
            sum +
            (corr && "AmountMismatch" in corr ? corr.AmountMismatch.pdf_amount : m.amount || 0)
          );
        }, 0);
        const amountOk = allContested || pdf_line.amount === currentTotal;
        return allAnomaliesAccepted && amountOk;
      }

      return false; // TooManyMatchIssue: cannot be resolved
    },
    [acceptedKeys, autoCorrections],
  );

  const resolvedCount = useMemo(
    () => sortedIssues.filter(isResolved).length,
    [sortedIssues, isResolved],
  );

  const blockingCount = useMemo(
    () => sortedIssues.filter((m) => m.type === "TooManyMatchIssue").length,
    [sortedIssues],
  );

  const unresolvedGroupCount = useMemo(
    () => sortedIssues.filter((m) => m.type === "GroupMatchIssue" && !isResolved(m)).length,
    [sortedIssues, isResolved],
  );

  useEffect(() => {
    onReportResolvedCount?.(resolvedCount);
  }, [resolvedCount, onReportResolvedCount]);

  useEffect(() => {
    onReportUnresolvedGroupCount?.(unresolvedGroupCount);
  }, [unresolvedGroupCount, onReportUnresolvedGroupCount]);

  const currentIssue = sortedIssues[currentIndex] ?? null;

  // Auto-advance to next unresolved issue when current becomes resolved
  useEffect(() => {
    if (!currentIssue || !isResolved(currentIssue)) return;
    const nextUnresolved = sortedIssues.findIndex(
      (issue, i) => i > currentIndex && !isResolved(issue),
    );
    if (nextUnresolved === -1) return; // all resolved, stay
    const timer = setTimeout(() => setCurrentIndex(nextUnresolved), 500);
    return () => clearTimeout(timer);
  }, [currentIssue, currentIndex, isResolved, sortedIssues]);

  return {
    sortedIssues,
    currentIndex,
    currentIssue,
    goNext,
    goPrev,
    goTo,
    isResolved,
    resolvedCount,
    blockingCount,
  };
}
