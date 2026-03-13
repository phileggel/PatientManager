import { Plus } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSnackbar } from "@/core/snackbar";
import { logger } from "@/lib/logger";
import { Button, CardLegacy, DateField, SelectField } from "@/ui/components";
import { ProcedureSelectionModal } from "../select_procedure_modal/SelectProcedureModal";
import { useAddFundPaymentPanel } from "./useAddFundPaymentPanel";

/**
 * AddFundPaymentPanel - Smart Component
 *
 * Fully self-contained:
 * - Gets funds from global store (via hook)
 * - Manages form state (fund, date, procedures)
 * - Manages modal state
 * - Fetches procedures via gateway
 * - Creates payment via gateway
 * - Emits success event for parent to refresh
 * - Handles errors via snackbar
 *
 * No props needed - it's completely independent
 */
export function AddFundPaymentPanel() {
  const { t } = useTranslation("fund-payment");
  const { t: tc } = useTranslation("common");

  useEffect(() => {
    logger.info("[AddFundPaymentPanel] Component mounted");
  }, []);
  const { showSnackbar } = useSnackbar();

  const {
    selectedFundId,
    setSelectedFundId,
    paymentDate,
    setPaymentDate,
    errors,
    selectedFund,
    fundSelectorLabels,
    selectionSummary,
    hasSelection,
    isModalOpen,
    setIsModalOpen,
    isSubmitting,
    handleOpenSelection,
    handleConfirmSelection,
    handleCreatePayment,
  } = useAddFundPaymentPanel();

  const handleCreatePaymentWithFeedback = async () => {
    const result = await handleCreatePayment();
    if (result?.success) {
      showSnackbar("success", t("add.success"));
      // Emit event for parent to refresh
      window.dispatchEvent(new Event("fundpaymentgroup_updated"));
    } else {
      showSnackbar("error", result?.error || tc("error.unknown"));
    }
  };

  return (
    <CardLegacy title={t("add.cardTitle")}>
      <form onSubmit={handleOpenSelection} className="flex flex-col gap-6">
        {/* Form inputs section */}
        <fieldset disabled={isSubmitting} className="disabled:opacity-50">
          <div className="flex flex-col gap-6">
            <SelectField
              id="fund"
              label={t("add.fund")}
              value={selectedFundId}
              onChange={(e) => setSelectedFundId(e.target.value)}
              options={fundSelectorLabels}
              error={errors.fund}
            />

            {selectedFund && (
              <div className="px-4 py-3 bg-m3-surface rounded-lg border border-m3-outline">
                <p className="text-sm font-medium text-m3-on-surface">{selectedFund.fundName}</p>
              </div>
            )}

            <DateField
              id="paymentDate"
              label={t("add.paymentDate")}
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              error={errors.paymentDate}
            />
          </div>
        </fieldset>

        {/* Action buttons */}
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <Button
              type="button"
              onClick={handleOpenSelection}
              disabled={isSubmitting}
              variant="secondary"
              className="flex-1"
            >
              {hasSelection ? t("add.modifySelection") : t("add.selectProcedures")}
            </Button>
            {errors.procedures && (
              <p className="text-xs text-m3-error mt-1 ml-1">{errors.procedures}</p>
            )}

            {/* Selection summary - moved here, closer to select button */}
            {hasSelection && (
              <div className="flex items-center gap-2 px-4 py-3 bg-m3-surface rounded-lg border border-m3-outline">
                <span className="text-sm font-medium text-m3-on-surface-variant">
                  {t("add.procedures")}
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-m3-primary-container text-m3-on-primary-container">
                  {selectionSummary.count}
                </span>
                <span className="flex-1" />
                <span className="text-sm font-medium text-m3-on-surface">
                  {selectionSummary.totalFormatted}
                </span>
              </div>
            )}
          </div>

          <Button
            type="button"
            onClick={handleCreatePaymentWithFeedback}
            disabled={isSubmitting}
            loading={isSubmitting}
            variant="primary"
            icon={<Plus size={18} />}
            className="flex-1"
          >
            {isSubmitting ? t("add.creating") : t("add.createButton")}
          </Button>
        </div>
      </form>

      {/* Modal managed internally - fetches its own data */}
      <ProcedureSelectionModal
        isOpen={isModalOpen}
        fundId={selectedFundId}
        initialSelectionIds={[]}
        onConfirm={handleConfirmSelection}
        onCancel={() => setIsModalOpen(false)}
        isSubmitting={isSubmitting}
      />
    </CardLegacy>
  );
}
