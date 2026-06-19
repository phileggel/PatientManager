/**
 * ReconciliationModal - PDF reconciliation workflow.
 *
 * Single-view modal (no tabs): focuses entirely on anomaly review.
 * After validation: switches to UnreconciledReportView for the PDF date range.
 * Logic: useReconciliationModal (PDF extraction, reconciliation, corrections, validate).
 */

import { CheckCircle2, FileText, Loader2, X } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useCacheStore } from "@/infra/cache/store";
import { logger } from "@/infra/logger";
import { Button } from "@/ui/components/button";
import { IconButton } from "@/ui/components/button/IconButton";
import { ModalContainer } from "@/ui/components/modal/ModalContainer";
import { ReconciliationResultsView } from "../reconciliation_results/ReconciliationResults";
import {
  presentReconciliationErrorState,
  type ReconciliationErrorState,
} from "../shared/errorPresenter";
import { buildFundIdToLabel } from "../shared/reportPresenter";
import { UnreconciledReportView } from "../unreconciled_report/UnreconciledReport";
import { useReconciliationModal } from "./useReconciliationModal";
import { useReportGeneration } from "./useReportGeneration";

interface ReconciliationModalProps {
  filePath: string;
  onClose: () => void;
}

export function ReconciliationModal({ filePath, onClose }: ReconciliationModalProps) {
  const { t } = useTranslation("fund-payment-match");

  useEffect(() => {
    logger.info("[ReconciliationModal] Component mounted");
  }, []);

  const {
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
  } = useReconciliationModal(filePath, onClose);

  const isReportStep = unreconciledReport !== null && reportDateRange !== null;

  // F27 Layer 4 — translate the typed error states at render time.
  const translateError = (state: ReconciliationErrorState): string => {
    const { key, params } = presentReconciliationErrorState(state);
    return t(key, params);
  };
  const errorMessage = error ? translateError(error) : null;
  const validationErrorMessage = validationError ? translateError(validationError) : null;

  const funds = useCacheStore((state) => state.funds);
  const fundIdToLabel = useMemo(() => buildFundIdToLabel(funds), [funds]);

  const { handleReport, isGenerating } = useReportGeneration({
    filePath,
    reportDateRange,
    unreconciledReport,
    autoCorrections,
    reconciliationData,
    fundIdToLabel,
  });

  return (
    <ModalContainer
      id="reconciliation-modal"
      isOpen={true}
      onClose={onClose}
      maxWidth="max-w-4xl"
      titleId="reconciliation-modal-title"
    >
      {/* Header — hidden when printing (R31) */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-m3-outline/20 shrink-0 print:hidden">
        <div>
          <h2
            id="reconciliation-modal-title"
            className="text-base font-semibold text-m3-on-surface"
          >
            {t("modal.title")}
          </h2>
          <p className="text-xs text-m3-on-surface-variant mt-0.5">
            {t("modal.subtitle", { name: filePath.split(/[\\/]/).pop() ?? filePath })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* FPR-010: Report button — only shown during report step.
              FPR-014: errors surface as a toast from `useReportGeneration`. */}
          {isReportStep && (
            <Button variant="secondary" loading={isGenerating} onClick={handleReport}>
              <FileText size={16} className="mr-1.5" />
              {t("modal.header.report")}
            </Button>
          )}
          <IconButton
            icon={<X size={20} />}
            variant="ghost"
            shape="round"
            aria-label={t("modal.header.close")}
            onClick={onClose}
          />
        </div>
      </div>

      {/* Content */}
      {isReportStep ? (
        <div className="flex-1 overflow-y-auto p-6 print:overflow-visible">
          <UnreconciledReportView
            procedures={unreconciledReport}
            startDate={reportDateRange.start}
            endDate={reportDateRange.end}
            onClose={onClose}
          />
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20 text-m3-on-surface-variant">
                <Loader2 size={32} className="animate-spin text-m3-primary" />
                <p className="text-sm">{t("modal.loading.content")}</p>
              </div>
            ) : error ? (
              <div className="rounded-lg bg-m3-error-container/40 border border-m3-error/20 px-5 py-4">
                <p role="alert" className="text-sm text-m3-on-error-container">
                  {errorMessage}
                </p>
              </div>
            ) : alreadyImported ? (
              <output
                id="reconciliation-modal-already-imported"
                className="flex flex-col items-center justify-center gap-3 py-20 text-m3-on-surface-variant"
              >
                <CheckCircle2 size={40} className="text-m3-primary" />
                <h3 className="text-base font-semibold text-m3-on-surface">
                  {t("modal.already_imported.title")}
                </h3>
                <p className="text-sm text-center max-w-md">{t("modal.already_imported.body")}</p>
              </output>
            ) : reconciliationData ? (
              <ReconciliationResultsView
                result={reconciliationData.reconciliation}
                acceptedKeys={acceptedKeys}
                autoCorrections={autoCorrections}
                onAcceptCorrection={handleAcceptCorrection}
                onUnacceptCorrection={handleUnacceptCorrection}
                onReportResolvedCount={handleReportResolvedCount}
                onReportUnresolvedGroupCount={handleReportUnresolvedGroupCount}
              />
            ) : null}
          </div>

          {/* Footer */}
          {!isLoading && !error && alreadyImported && (
            <div className="shrink-0 border-t border-m3-outline/20 bg-m3-surface-container-low px-6 py-4">
              <div className="flex items-center justify-end">
                <Button variant="primary" onClick={onClose}>
                  {t("modal.footer.cancel")}
                </Button>
              </div>
            </div>
          )}

          {!isLoading && !error && reconciliationData && (
            <div className="shrink-0 border-t border-m3-outline/20 bg-m3-surface-container-low px-6 py-4">
              {validationErrorMessage && (
                <p role="alert" className="text-xs text-m3-error mb-3">
                  {validationErrorMessage}
                </p>
              )}
              <div className="flex items-center justify-between gap-3">
                <Button variant="ghost" onClick={onClose}>
                  {t("modal.footer.cancel")}
                </Button>
                <div className="flex items-center gap-3">
                  {blockingCount === 0 &&
                    unresolvedGroupCount === 0 &&
                    resolvedCount < totalAnomalies && (
                      <Button variant="secondary" onClick={handleAutoCorrectAll}>
                        {t("modal.footer.auto_correct")}
                      </Button>
                    )}
                  {/* FPA-460 — explicit batch apply; enabled once every anomaly is resolved. */}
                  <Button
                    id="reconciliation-modal-validate"
                    variant="primary"
                    loading={isValidating}
                    disabled={!canValidate}
                    onClick={handleValidate}
                  >
                    {t("modal.footer.validate")}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </ModalContainer>
  );
}
