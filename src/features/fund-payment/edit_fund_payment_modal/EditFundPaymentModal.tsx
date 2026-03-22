/**
 * EditFundPaymentModal - Modal for editing a fund payment group
 *
 * Design reference: docs/stitch/update-fund-payment-modal.stitch (Clinical Atelier)
 *
 * Layout:
 * - Read-only fund info grid (fund name + fund identifier)
 * - Payment date field
 * - "Current procedures" list (removable via uncheck, Clinical Atelier row style)
 * - Summary bar: count + running total (R20)
 * - Footer: Cancel | Add procedures button | Update button
 *
 * Sources: getFundPaymentGroupEditData (mount), updatePaymentGroupWithProcedures (submit)
 * Logic delegated to useEditFundPaymentModal.
 */

import { Calendar, Check, Plus } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { FundPaymentGroup, Procedure } from "@/bindings";
import { logger } from "@/lib/logger";
import { Button, Dialog } from "@/ui/components";
import { DateField } from "@/ui/components/field/DateField";
import { ProcedureSelectionModal } from "../select_procedure_modal/SelectProcedureModal";
import { formatAmountEUR, formatDateFR } from "../shared/presenter";
import { useEditFundPaymentModal } from "./useEditFundPaymentModal";

const EMPTY_IDS: string[] = [];

export interface EditFundPaymentModalProps {
  isOpen: boolean;
  payment: FundPaymentGroup | null;
  onClose: () => void;
}

export function EditFundPaymentModal({ isOpen, payment, onClose }: EditFundPaymentModalProps) {
  const { t } = useTranslation("fund-payment");

  const {
    paymentDate,
    setPaymentDate,
    currentProcedures,
    proceduresForModal,
    selectedIds,
    loading,
    selectedFund,
    totalAmount,
    isSelectModalOpen,
    toggleId,
    openSelectModal,
    closeSelectModal,
    handleProceduresAdded,
    getPatientName,
    handleSubmit,
  } = useEditFundPaymentModal(payment, onClose);

  useEffect(() => {
    logger.info("[EditFundPaymentModal] Component mounted");
  }, []);

  const renderProcedureRow = (proc: Procedure) => {
    const checked = selectedIds.has(proc.id);
    return (
      <label
        key={proc.id}
        className="flex items-center justify-between py-3 px-4 hover:bg-m3-surface-container-high transition-colors cursor-pointer focus-within:ring-2 focus-within:ring-m3-primary/50"
      >
        <div className="flex items-center gap-3">
          {/* Clinical Atelier checkbox: filled primary circle when checked */}
          <span
            aria-hidden="true"
            className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
              checked ? "bg-m3-primary shadow-elevation-1" : "bg-m3-surface-container-high"
            }`}
          >
            {checked && <Check size={12} strokeWidth={3} className="text-m3-on-primary" />}
          </span>
          <input
            type="checkbox"
            checked={checked}
            onChange={() => toggleId(proc.id)}
            disabled={loading}
            className="sr-only"
          />
          <div className="flex flex-col justify-center">
            <div className="text-[13px] font-semibold text-m3-on-surface leading-tight">
              {getPatientName(proc.patient_id)}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-m3-on-surface-variant/70 font-medium">
              <Calendar size={11} />
              {formatDateFR(proc.procedure_date)}
            </div>
          </div>
        </div>
        <span className="text-[13px] font-semibold text-m3-on-surface tabular-nums whitespace-nowrap">
          {formatAmountEUR(proc.procedure_amount ?? 0)}
        </span>
      </label>
    );
  };

  return (
    <>
      <Dialog isOpen={isOpen} onClose={onClose} title={t("edit.title")}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Fund Info (Read-only) — two-column grid, tonal surface */}
          <div className="grid grid-cols-2 gap-6 bg-m3-surface-container-low p-5 rounded-xl">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-m3-on-surface-variant/70">
                {t("edit.fundLabel")}
              </span>
              <div className="text-m3-on-surface font-semibold text-base">
                {selectedFund?.fundName}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-m3-on-surface-variant/70">
                {t("edit.fundIdentifier")}
              </span>
              <div className="text-m3-on-surface font-semibold text-base">
                {selectedFund?.fundIdentifier}
              </div>
            </div>
          </div>

          {/* Payment Date */}
          <DateField
            id="paymentDate"
            label={`${t("edit.paymentDateLabel")} *`}
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            disabled={loading}
          />

          {/* Section: Current procedures */}
          <section className="space-y-3" aria-busy={loading}>
            <h3 className="text-lg font-bold text-m3-on-surface tracking-tight">
              {t("edit.sectionCurrent")}
            </h3>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 rounded-full border-2 border-m3-primary/30 border-t-m3-primary animate-spin" />
              </div>
            ) : currentProcedures.length === 0 ? (
              <p className="text-center py-8 text-m3-on-surface-variant">
                {t("edit.noProcedures")}
              </p>
            ) : (
              <div className="bg-m3-surface-container rounded-xl overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                  {currentProcedures.map(renderProcedureRow)}
                </div>
              </div>
            )}
          </section>

          {/* Summary bar (R20) */}
          <div className="py-3 px-4 bg-m3-secondary-container/40 rounded-xl flex justify-between items-center">
            <span className="text-[13px] font-semibold text-m3-primary">
              {t("edit.proceduresSelected", { count: selectedIds.size })}
            </span>
            <span className="text-[14px] font-bold text-m3-primary tracking-tight">
              {t("edit.total")} : {formatAmountEUR(totalAmount)}
            </span>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={loading}
            >
              {t("edit.cancel")}
            </Button>
            <div className="flex-1" />
            <div
              className="inline-flex"
              title={
                proceduresForModal.length === 0 ? t("edit.addProceduresDisabledHint") : undefined
              }
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openSelectModal}
                disabled={loading || proceduresForModal.length === 0}
                icon={<Plus size={13} />}
              >
                {t("edit.addProcedures")}
              </Button>
            </div>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={loading}
              disabled={loading || !paymentDate.trim() || selectedIds.size === 0}
            >
              {t("edit.update")}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Add procedures sub-modal (R19) */}
      <ProcedureSelectionModal
        isOpen={isSelectModalOpen}
        fundId={payment?.fund_id ?? ""}
        initialSelectionIds={EMPTY_IDS}
        preloadedProcedures={proceduresForModal}
        onConfirm={handleProceduresAdded}
        onCancel={closeSelectModal}
      />
    </>
  );
}
