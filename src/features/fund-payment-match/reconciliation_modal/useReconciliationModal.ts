/**
 * Hook for ReconciliationModal.
 * Orchestrates the full reconciliation workflow:
 *   1. Extracts and parses the PDF (on mount)
 *   2. Reconciles PDF lines against the database
 *   3. Manages auto-correction state (accepted keys + corrections map)
 *   4. On validate: applies corrections, creates fund payment groups,
 *      then fetches the unreconciled-procedures report for the PDF date range
 *
 * Sources: gateway (Tauri commands), toastService for success feedback
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AutoCorrection,
  PdfParseResult,
  ReconcileAndCandidatesResponse,
  UnreconciledProcedure,
} from "@/bindings";
import { logger } from "@/infra/logger";
import { toastService } from "@/ui/components/snackbar";
import {
  createFundPaymentWithAutoCorrections,
  extractPdfText,
  getUnreconciledProceduresInRange,
  parsePdfText,
  reconcileAndCreateCandidates,
} from "../gateway";
import type { ReconciliationErrorState } from "../shared/errorPresenter";
import {
  buildCorrectionKey,
  buildLinkProcedureKey,
  buildNotFoundCorrection,
  buildNotFoundKey,
  computePdfDateRange,
  countTotalAnomalies,
} from "../shared/utils";

export function useReconciliationModal(filePath: string, onClose: () => void) {
  const { t } = useTranslation("fund-payment-match");

  const [parsedData, setParsedData] = useState<PdfParseResult | null>(null);
  const [reconciliationData, setReconciliationData] =
    useState<ReconcileAndCandidatesResponse | null>(null);
  const [alreadyImported, setAlreadyImported] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ReconciliationErrorState | null>(null);

  const [acceptedKeys, setAcceptedKeys] = useState<Set<string>>(new Set());
  const [autoCorrections, setAutoCorrections] = useState<Map<string, AutoCorrection>>(new Map());
  const [resolvedCount, setResolvedCount] = useState(0);
  const [unresolvedGroupCount, setUnresolvedGroupCount] = useState(0);
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<ReconciliationErrorState | null>(null);

  const [unreconciledReport, setUnreconciledReport] = useState<UnreconciledProcedure[] | null>(
    null,
  );
  const [reportDateRange, setReportDateRange] = useState<{ start: string; end: string } | null>(
    null,
  );

  // Load and reconcile PDF on mount
  useEffect(() => {
    async function loadAndReconcilePdf() {
      try {
        setIsLoading(true);
        setError(null);
        const textResult = await extractPdfText(filePath);
        if (!textResult.success) {
          setError({ kind: "typed", error: textResult.error });
          return;
        }
        const parsed = await parsePdfText(textResult.data);
        setParsedData(parsed);
        const reconResult = await reconcileAndCreateCandidates(parsed);
        if (!reconResult.success) {
          setError({ kind: "typed", error: reconResult.error });
          return;
        }
        if (reconResult.data.already_imported) {
          setAlreadyImported(true);
        } else {
          setReconciliationData(reconResult.data);
        }
      } catch (err) {
        logger.error("[useReconciliationModal] Failed to load or reconcile PDF", { err });
        setError({ kind: "unexpected" });
      } finally {
        setIsLoading(false);
      }
    }
    loadAndReconcilePdf();
  }, [filePath]);

  const totalAnomalies = useMemo(
    () => (reconciliationData ? countTotalAnomalies(reconciliationData.reconciliation) : 0),
    [reconciliationData],
  );

  const blockingCount = useMemo(
    () =>
      reconciliationData
        ? reconciliationData.reconciliation.matches.filter((m) => m.type === "TooManyMatchIssue")
            .length
        : 0,
    [reconciliationData],
  );

  const canValidate = reconciliationData !== null && resolvedCount === totalAnomalies;

  const handleAcceptCorrection = useCallback((key: string, correction: AutoCorrection) => {
    setAcceptedKeys((prev) => new Set(prev).add(key));
    setAutoCorrections((prev) => new Map(prev).set(key, correction));
  }, []);

  // FPA-460 — un-handle: drop all staged corrections for an issue so it returns
  // to its unresolved, editable state. Nothing is persisted until handleValidate,
  // so this is a pure in-memory revert with no backend round-trip.
  const handleUnacceptCorrection = useCallback((keys: string[]) => {
    setAcceptedKeys((prev) => {
      const next = new Set(prev);
      for (const key of keys) next.delete(key);
      return next;
    });
    setAutoCorrections((prev) => {
      const next = new Map(prev);
      for (const key of keys) next.delete(key);
      return next;
    });
  }, []);

  const handleReportResolvedCount = useCallback((count: number) => {
    setResolvedCount(count);
  }, []);

  const handleReportUnresolvedGroupCount = useCallback((count: number) => {
    setUnresolvedGroupCount(count);
  }, []);

  const handleAutoCorrectAll = useCallback(() => {
    if (!reconciliationData) return;

    const newAcceptedKeys = new Set(acceptedKeys);
    const newAutoCorrections = new Map(autoCorrections);

    for (const match of reconciliationData.reconciliation.matches) {
      if (match.type === "NotFoundIssue") {
        const key = buildNotFoundKey(match.data.pdf_line);
        const isAlreadyLinked = match.data.nearby_candidates.some((c) =>
          newAcceptedKeys.has(
            buildLinkProcedureKey(match.data.pdf_line.line_index, c.procedure_id),
          ),
        );
        if (!newAcceptedKeys.has(key) && !isAlreadyLinked) {
          newAcceptedKeys.add(key);
          newAutoCorrections.set(key, buildNotFoundCorrection(match.data.pdf_line));
        }
      } else if (match.type === "SingleMatchIssue") {
        const { pdf_line, db_match } = match.data;
        for (const anomaly of db_match.anomalies) {
          const key = buildCorrectionKey(anomaly, db_match.procedure_id);
          if (!newAcceptedKeys.has(key)) {
            newAcceptedKeys.add(key);
            let correction: AutoCorrection;
            if (anomaly === "AmountMismatch")
              correction = {
                AmountMismatch: {
                  procedure_id: db_match.procedure_id,
                  pdf_amount: pdf_line.amount,
                },
              };
            else if (anomaly === "FundMismatch")
              correction = {
                FundMismatch: {
                  procedure_id: db_match.procedure_id,
                  pdf_fund_label: pdf_line.fund_name,
                },
              };
            else
              correction = {
                DateMismatch: {
                  procedure_id: db_match.procedure_id,
                  pdf_date: pdf_line.procedure_start_date,
                },
              };
            newAutoCorrections.set(key, correction);
          }
        }
      }
    }

    setAcceptedKeys(newAcceptedKeys);
    setAutoCorrections(newAutoCorrections);
  }, [reconciliationData, acceptedKeys, autoCorrections]);

  const handleValidate = useCallback(async () => {
    if (!reconciliationData || !parsedData) return;
    try {
      setIsValidating(true);
      const createResult = await createFundPaymentWithAutoCorrections({
        candidates: reconciliationData.candidates,
        auto_corrections: Array.from(autoCorrections.values()),
      });
      if (!createResult.success) {
        setValidationError({ kind: "typed", error: createResult.error });
        return;
      }
      toastService.show("success", t("modal.footer.validate_success"));
      const dateRange = computePdfDateRange(parsedData);
      if (dateRange) {
        setReportDateRange(dateRange);
        const proceduresResult = await getUnreconciledProceduresInRange(
          dateRange.start,
          dateRange.end,
        );
        if (!proceduresResult.success) {
          setValidationError({ kind: "typed", error: proceduresResult.error });
          return;
        }
        setUnreconciledReport(proceduresResult.data);
      } else {
        onClose();
      }
    } catch (err) {
      logger.error("[useReconciliationModal] Validation failed", { err });
      setValidationError({ kind: "unexpected" });
    } finally {
      setIsValidating(false);
    }
  }, [reconciliationData, parsedData, autoCorrections, onClose, t]);

  return {
    reconciliationData,
    alreadyImported,
    isLoading,
    error,
    acceptedKeys,
    autoCorrections,
    resolvedCount,
    totalAnomalies,
    blockingCount,
    isValidating,
    validationError,
    unreconciledReport,
    reportDateRange,
    canValidate,
    handleAcceptCorrection,
    handleUnacceptCorrection,
    handleReportResolvedCount,
    handleReportUnresolvedGroupCount,
    handleAutoCorrectAll,
    handleValidate,
    unresolvedGroupCount,
  };
}
