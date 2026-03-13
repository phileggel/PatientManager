/**
 * ReconciliationModal - PDF reconciliation workflow.
 *
 * Single-view modal (no tabs): focuses entirely on anomaly review.
 * After validation: switches to UnreconciledReportView for the PDF date range.
 * Logic: useReconciliationModal (PDF extraction, reconciliation, corrections, validate).
 */

import { Loader2, X } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { logger } from "@/lib/logger";
import { Button } from "@/ui/components/button";
import { ModalContainer } from "@/ui/components/modal/ModalContainer";
import { ReconciliationResultsView } from "../reconciliation_results/ReconciliationResults";
import { UnreconciledReportView } from "../unreconciled_report/UnreconciledReport";
import { useReconciliationModal } from "./useReconciliationModal";

interface ReconciliationModalProps {
  file: File;
  onClose: () => void;
}

export function ReconciliationModal({ file, onClose }: ReconciliationModalProps) {
  const { t } = useTranslation("fund-payment-match");

  useEffect(() => {
    logger.info("[ReconciliationModal] Component mounted");
  }, []);

  const {
    reconciliationData,
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
    handleAcceptCorrection,
    handleReportResolvedCount,
    handleReportUnresolvedGroupCount,
    handleAutoCorrectAll,
    unresolvedGroupCount,
  } = useReconciliationModal(file, onClose);

  // After validation: show unreconciled report
  if (unreconciledReport !== null && reportDateRange !== null) {
    return (
      <ModalContainer isOpen={true} onClose={onClose} maxWidth="max-w-4xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-m3-outline/20">
          <div>
            <h2 className="text-base font-semibold text-m3-on-surface">{t("modal.title")}</h2>
            <p className="text-xs text-m3-on-surface-variant mt-0.5">
              {t("modal.subtitle", { name: file.name })}
            </p>
          </div>
          <button type="button" onClick={onClose} className="m3-icon-button-primary">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <UnreconciledReportView
            procedures={unreconciledReport}
            startDate={reportDateRange.start}
            endDate={reportDateRange.end}
            onClose={onClose}
          />
        </div>
      </ModalContainer>
    );
  }

  return (
    <ModalContainer isOpen={true} onClose={onClose} maxWidth="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-m3-outline/20 shrink-0">
        <div>
          <h2 className="text-base font-semibold text-m3-on-surface">{t("modal.title")}</h2>
          <p className="text-xs text-m3-on-surface-variant mt-0.5">
            {t("modal.subtitle", { name: file.name })}
          </p>
        </div>
        <button type="button" onClick={onClose} className="m3-icon-button-primary">
          <X size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-m3-on-surface-variant">
            <Loader2 size={32} className="animate-spin text-m3-primary" />
            <p className="text-sm">{t("modal.loading.content")}</p>
          </div>
        ) : error ? (
          <div className="rounded-lg bg-m3-error-container/40 border border-m3-error/20 px-5 py-4">
            <p className="text-sm text-m3-on-error-container">{error}</p>
          </div>
        ) : reconciliationData ? (
          <ReconciliationResultsView
            result={reconciliationData.reconciliation}
            acceptedKeys={acceptedKeys}
            autoCorrections={autoCorrections}
            onAcceptCorrection={handleAcceptCorrection}
            onReportResolvedCount={handleReportResolvedCount}
            onReportUnresolvedGroupCount={handleReportUnresolvedGroupCount}
          />
        ) : null}
      </div>

      {/* Footer */}
      {!isLoading && !error && reconciliationData && (
        <div className="shrink-0 border-t border-m3-outline/20 bg-m3-surface-container-low px-6 py-4">
          {validationError && <p className="text-xs text-m3-error mb-3">{validationError}</p>}
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={onClose}>
              {t("modal.footer.cancel")}
            </Button>
            {blockingCount === 0 &&
              unresolvedGroupCount === 0 &&
              resolvedCount < totalAnomalies && (
                <Button variant="primary" loading={isValidating} onClick={handleAutoCorrectAll}>
                  {t("modal.footer.autoCorrect")}
                </Button>
              )}
          </div>
        </div>
      )}
    </ModalContainer>
  );
}
