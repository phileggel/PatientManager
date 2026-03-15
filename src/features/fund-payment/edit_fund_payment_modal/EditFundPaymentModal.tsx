/**
 * EditFundPaymentModal - Modal for editing a fund payment group
 *
 * Displays two sections:
 * - "Actes en cours": procedures currently in the group (removable)
 * - "Actes disponibles": Created procedures for the same fund (addable)
 *
 * Logic delegated to useEditFundPaymentModal.
 */

import { Calendar } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { FundPaymentGroup, Procedure } from "@/bindings";
import { logger } from "@/lib/logger";
import { Button, Dialog } from "@/ui/components";
import { DateField } from "@/ui/components/field/DateField";
import { useEditFundPaymentModal } from "./useEditFundPaymentModal";

export interface EditFundPaymentModalProps {
  payment: FundPaymentGroup;
  onClose: () => void;
}

export function EditFundPaymentModal({ payment, onClose }: EditFundPaymentModalProps) {
  const { t } = useTranslation("fund-payment");

  const {
    paymentDate,
    setPaymentDate,
    currentProcedures,
    availableProcedures,
    selectedIds,
    loading,
    selectedFund,
    toggleId,
    getPatientName,
    handleSubmit,
  } = useEditFundPaymentModal(payment, onClose);

  useEffect(() => {
    logger.info("[EditFundPaymentModal] Component mounted");
  }, []);

  const formatDateFrench = (isoDate: string): string => {
    const date = new Date(`${isoDate}T00:00:00Z`);
    return new Intl.DateTimeFormat("fr-FR").format(date);
  };

  const renderProcedure = (proc: Procedure) => (
    <label
      key={proc.id}
      className="flex items-center gap-3 px-3 py-4 pr-6 hover:bg-neutral-10 cursor-pointer transition-colors"
    >
      <input
        type="checkbox"
        checked={selectedIds.has(proc.id)}
        onChange={() => toggleId(proc.id)}
        disabled={loading}
        className="w-4 h-4"
      />
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center gap-4">
          <span className="flex items-center gap-1 text-xs text-neutral-70 whitespace-nowrap">
            <Calendar size={12} />
            {formatDateFrench(proc.procedure_date)}
          </span>
          <p className="text-sm font-medium text-neutral-90">{getPatientName(proc.patient_id)}</p>
          <span className="font-semibold text-neutral-90 whitespace-nowrap">
            €{((proc.procedure_amount || 0) / 1000).toFixed(2)}
          </span>
        </div>
      </div>
    </label>
  );

  return (
    <Dialog isOpen={true} onClose={onClose} title={t("edit.title")}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Fund Info (Read-only) */}
        <div>
          <div className="text-sm font-medium text-neutral-70 mb-1">{t("edit.fundLabel")}</div>
          <div className="p-3 bg-neutral-10 rounded border border-neutral-20">
            <p className="text-sm text-neutral-90 font-medium">{selectedFund?.fundName}</p>
            <p className="text-xs text-neutral-60">{selectedFund?.fundIdentifier}</p>
          </div>
        </div>

        {/* Payment Date */}
        <div>
          <DateField
            id="paymentDate"
            label={`${t("edit.paymentDateLabel")} *`}
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            disabled={loading}
          />
        </div>

        {/* Procedure Sections */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-neutral-90">
            {t("edit.proceduresSelected", { count: selectedIds.size })}
          </p>

          {/* Section: Actes en cours */}
          {currentProcedures.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-neutral-60 uppercase tracking-wide mb-1">
                {t("edit.sectionCurrent")}
              </p>
              <div className="border border-neutral-30 rounded-lg divide-y max-h-48 overflow-y-auto">
                {currentProcedures.map(renderProcedure)}
              </div>
            </div>
          )}

          {/* Section: Actes disponibles */}
          {availableProcedures.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-neutral-60 uppercase tracking-wide mb-1">
                {t("edit.sectionAvailable")}
              </p>
              <div className="border border-neutral-30 rounded-lg divide-y max-h-48 overflow-y-auto">
                {availableProcedures.map(renderProcedure)}
              </div>
            </div>
          )}

          {currentProcedures.length === 0 && availableProcedures.length === 0 && !loading && (
            <p className="text-center py-8 text-neutral-60">{t("edit.noProcedures")}</p>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-2 justify-end pt-4 border-t border-neutral-20">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            {t("edit.cancel")}
          </Button>
          <Button type="submit" variant="primary" loading={loading}>
            {t("edit.update")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
