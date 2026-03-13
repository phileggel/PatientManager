import { X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AffiliatedFund, Patient, PaymentMethod, Procedure, ProcedureType } from "@/bindings";

import { toastService } from "@/core/snackbar";
import { logger } from "@/lib/logger";
import { Button, InputLegacy, SelectLegacy } from "@/ui/components";
import { updateProcedure } from "../api/procedureService";

interface ProcedureUpdateModalProps {
  procedure: Procedure;
  patients: Patient[];
  funds: AffiliatedFund[];
  procedureTypes: ProcedureType[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ProcedureUpdateModal({
  procedure,
  patients,
  funds,
  procedureTypes,
  isOpen,
  onClose,
  onSuccess,
}: ProcedureUpdateModalProps) {
  const { t } = useTranslation("procedure");
  const { t: tc } = useTranslation("common");

  useEffect(() => {
    logger.info("[ProcedureUpdateModal] Component mounted");
  }, []);

  const [patientId, setPatientId] = useState(procedure.patient_id || "");
  const [fundId, setFundId] = useState(procedure.fund_id || "");
  const [procedureTypeId, setProcedureTypeId] = useState(procedure.procedure_type_id || "");
  const [procedureDate, setProcedureDate] = useState(procedure.procedure_date || "");
  const [procedureAmount, setProcedureAmount] = useState(
    procedure.procedure_amount != null ? (procedure.procedure_amount / 1000).toString() : "0",
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    procedure.payment_method || "NONE",
  );
  const [paymentDate, setPaymentDate] = useState(procedure.confirmed_payment_date || "");
  const [loading, setLoading] = useState(false);

  const selectedPatient = patients.find((p) => p.id === patientId);
  const selectedFund = funds.find((f) => f.id === fundId);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!patientId || !procedureTypeId || !procedureDate) {
      logger.warn("Update procedure form submitted with missing required fields");
      toastService.show("error", t("error.requiredFields"));
      return;
    }

    logger.debug("Submitting update procedure form", { id: procedure.id, patientId });
    setLoading(true);

    try {
      const updatedProcedure: Procedure = {
        ...procedure,
        patient_id: patientId,
        fund_id: fundId || null,
        procedure_type_id: procedureTypeId,
        procedure_date: procedureDate,
        procedure_amount: procedureAmount ? Math.round(Number(procedureAmount) * 1000) : 0,
        payment_method: paymentMethod || "NONE",
        confirmed_payment_date: paymentDate || "",
      };

      const result = await updateProcedure(updatedProcedure);

      if (result.success) {
        toastService.show("success", t("state.updated"));
        onSuccess?.();
        onClose();
      } else {
        toastService.show("error", t("modal.updateError", { error: result.error }));
      }
    } catch (error) {
      logger.error("Error updating procedure", { error });
      toastService.show("error", t("modal.updateUnknown"));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Backdrop dismiss pattern
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          onClose();
        }
      }}
      role="presentation"
    >
      <div
        className="relative w-full max-w-2xl rounded-lg bg-surface p-6 shadow-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.stopPropagation();
          }
        }}
        role="dialog"
        aria-modal="true"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-600 hover:text-slate-900"
          aria-label={t("modal.closeAriaLabel")}
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="mb-6 text-xl font-semibold text-slate-900">{t("modal.title")}</h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Editable Fields */}
          <SelectLegacy
            id="updatePatient"
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            disabled={loading}
          >
            <option value="">{t("modal.selectPatient")}</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectLegacy>

          <SelectLegacy
            id="updateFund"
            value={fundId}
            onChange={(e) => setFundId(e.target.value)}
            disabled={loading}
          >
            <option value="">{t("form.selectFund")}</option>
            {[...funds]
              .sort((a, b) => a.fund_identifier.localeCompare(b.fund_identifier))
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.fund_identifier} ({f.name})
                </option>
              ))}
          </SelectLegacy>

          <SelectLegacy
            id="updateProcedureType"
            value={procedureTypeId}
            onChange={(e) => setProcedureTypeId(e.target.value)}
            disabled={loading}
          >
            <option value="">{t("modal.selectProcedureType")}</option>
            {procedureTypes.map((pt) => (
              <option key={pt.id} value={pt.id}>
                {pt.name}
              </option>
            ))}
          </SelectLegacy>

          <InputLegacy
            id="updateProcedureDate"
            label={t("form.procedureDate")}
            type="date"
            value={procedureDate}
            onChange={(e) => setProcedureDate(e.target.value)}
            disabled={loading}
          />

          <InputLegacy
            id="updateProcedureAmount"
            label={t("form.amount")}
            type="number"
            step="0.01"
            min="0"
            value={procedureAmount}
            onChange={(e) => setProcedureAmount(e.target.value)}
            disabled={loading}
          />

          {/* Readonly Fields */}
          <div className="border-t pt-4 mt-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">{t("modal.systemInfo")}</h3>
            <div className="grid grid-cols-1 gap-4">
              <InputLegacy
                id="readonlyId"
                label={t("modal.procedureId")}
                value={procedure.id}
                disabled
              />
            </div>
          </div>

          <div className="border-t pt-4 mt-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">{t("modal.patientInfo")}</h3>
            <div className="grid grid-cols-2 gap-4">
              <InputLegacy
                id="readonlySsn"
                label={t("modal.ssn")}
                value={selectedPatient?.ssn || "—"}
                disabled
              />
              <InputLegacy
                id="readonlyFundName"
                label={t("modal.fundName")}
                value={selectedFund?.name || "—"}
                disabled
              />
            </div>
          </div>

          {/* Payment Fields (Editable) */}
          <div className="border-t pt-4 mt-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">{t("modal.paymentInfo")}</h3>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <SelectLegacy
                  id="updatePaymentMethod"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  disabled={loading}
                >
                  <option value="">{t("form.selectPaymentMethod")}</option>
                  <option value="NONE">{t("form.payment.none")}</option>
                  <option value="CASH">{t("form.payment.cash")}</option>
                  <option value="CHECK">{t("form.payment.check")}</option>
                  <option value="BANK_CARD">{t("form.payment.card")}</option>
                  <option value="BANK_TRANSFER">{t("form.payment.transfer")}</option>
                </SelectLegacy>

                <InputLegacy
                  id="updatePaymentDate"
                  label={t("form.paymentDate")}
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <InputLegacy
                  id="readonlyStatus"
                  label={t("modal.status")}
                  value={procedure.payment_status || "NONE"}
                  disabled
                />
                <InputLegacy
                  id="readonlyActualAmount"
                  label={t("modal.paidAmount")}
                  value={`€${((procedure.actual_payment_amount ?? 0) / 1000).toFixed(2)}`}
                  disabled
                />
                <InputLegacy
                  id="readonlyAwaitedAmount"
                  label={t("modal.awaitedAmount")}
                  value={`€${(0).toFixed(2)}`}
                  disabled
                />
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              onClick={onClose}
              variant="secondary"
              disabled={loading}
              className="flex-1"
            >
              {tc("action.cancel")}
            </Button>
            <Button type="submit" variant="primary" loading={loading} className="flex-1">
              {loading ? t("action.updating") : t("action.update")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
