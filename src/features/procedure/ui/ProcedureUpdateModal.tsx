import { X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AffiliatedFund,
  Patient,
  PaymentMethod,
  Procedure,
  ProcedureType,
  RawProcedure,
} from "@/bindings";

import { toastService } from "@/core/snackbar";
import { logger } from "@/lib/logger";
import {
  AmountField,
  Button,
  DateField,
  ModalContainer,
  SelectField,
  TextField,
} from "@/ui/components";
import * as gateway from "../api/gateway";

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
  const [procedureAmount, setProcedureAmount] = useState<number | null>(
    procedure.procedure_amount != null ? procedure.procedure_amount / 1000 : null,
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">(
    procedure.payment_method ?? "",
  );
  const [paymentDate, setPaymentDate] = useState(procedure.confirmed_payment_date || "");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const selectedPatient = patients.find((p) => p.id === patientId);
  const selectedFund = funds.find((f) => f.id === fundId);

  const sortedFunds = [...funds].sort((a, b) => a.fund_identifier.localeCompare(b.fund_identifier));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    setSubmitted(true);
    if (!patientId || !procedureTypeId || !procedureDate) {
      logger.warn("Update procedure form submitted with missing required fields");
      return;
    }

    logger.info("[ProcedureUpdateModal] Submitting update", { id: procedure.id, patientId });
    setLoading(true);

    try {
      const updatedProcedure: RawProcedure = {
        id: procedure.id,
        patient_id: patientId,
        fund_id: fundId || null,
        procedure_type_id: procedureTypeId,
        procedure_date: procedureDate,
        procedure_amount: procedureAmount != null ? Math.round(procedureAmount * 1000) : null,
        payment_method: (paymentMethod || "NONE") as PaymentMethod,
        confirmed_payment_date: paymentDate || null,
        actual_payment_amount: procedure.actual_payment_amount,
        payment_status: procedure.payment_status,
      };

      await gateway.updateProcedure(updatedProcedure);
      toastService.show("success", t("state.updated"));
      onSuccess?.();
      onClose();
    } catch (error) {
      logger.error("[ProcedureUpdateModal] Error updating procedure", { error });
      toastService.show("error", t("modal.updateUnknown"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-2xl"
      titleId="procedure-update-modal-title"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-5">
        <h2 id="procedure-update-modal-title" className="text-xl font-semibold text-m3-on-surface">
          {t("modal.title")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-m3-on-surface-variant hover:text-m3-on-surface hover:bg-m3-surface-container rounded-xl transition-colors"
          aria-label={t("modal.closeAriaLabel")}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Scrollable form body */}
      <form
        id="update-procedure-form"
        onSubmit={handleSubmit}
        className="flex-1 overflow-y-auto p-5 flex flex-col gap-4"
      >
        {/* Editable fields */}
        <SelectField
          id="updatePatient"
          label={t("form.patient")}
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
          disabled={loading}
          error={submitted && !patientId ? t("error.requiredField") : undefined}
          options={[
            { label: t("modal.selectPatient"), value: "" },
            ...patients.map((p) => ({ label: p.name ?? "—", value: p.id })),
          ]}
        />

        <SelectField
          id="updateFund"
          label={t("form.fund")}
          value={fundId}
          onChange={(e) => setFundId(e.target.value)}
          disabled={loading}
          options={[
            { label: t("form.selectFund"), value: "" },
            ...sortedFunds.map((f) => ({
              label: `${f.fund_identifier} (${f.name})`,
              value: f.id,
            })),
          ]}
        />

        <SelectField
          id="updateProcedureType"
          label={t("form.procedureType")}
          value={procedureTypeId}
          onChange={(e) => setProcedureTypeId(e.target.value)}
          disabled={loading}
          error={submitted && !procedureTypeId ? t("error.requiredField") : undefined}
          options={[
            { label: t("modal.selectProcedureType"), value: "" },
            ...procedureTypes.map((pt) => ({ label: pt.name, value: pt.id })),
          ]}
        />

        <DateField
          id="updateProcedureDate"
          label={t("form.procedureDate")}
          value={procedureDate}
          onChange={(e) => setProcedureDate(e.target.value)}
          disabled={loading}
          error={submitted && !procedureDate ? t("error.requiredField") : undefined}
        />

        <AmountField
          id="updateProcedureAmount"
          label={t("form.amount")}
          value={procedureAmount}
          onChange={setProcedureAmount}
          disabled={loading}
        />

        {/* System Info */}
        <div className="bg-m3-surface-container-low rounded-xl p-4">
          <h3 className="text-sm font-semibold text-m3-on-surface-variant mb-3">
            {t("modal.systemInfo")}
          </h3>
          <TextField
            id="readonlyId"
            label={t("modal.procedureId")}
            value={procedure.id}
            readOnly
            disabled
          />
        </div>

        {/* Patient Info */}
        <div className="bg-m3-surface-container-low rounded-xl p-4">
          <h3 className="text-sm font-semibold text-m3-on-surface-variant mb-3">
            {t("modal.patientInfo")}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <TextField
              id="readonlySsn"
              label={t("modal.ssn")}
              value={selectedPatient?.ssn || "—"}
              readOnly
              disabled
            />
            <TextField
              id="readonlyFundName"
              label={t("modal.fundName")}
              value={selectedFund?.name || "—"}
              readOnly
              disabled
            />
          </div>
        </div>

        {/* Payment Fields */}
        <div className="bg-m3-surface-container-low rounded-xl p-4">
          <h3 className="text-sm font-semibold text-m3-on-surface-variant mb-3">
            {t("modal.paymentInfo")}
          </h3>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <SelectField
                id="updatePaymentMethod"
                label={t("form.paymentMethod")}
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod | "")}
                disabled={loading}
                options={[
                  { label: t("form.selectPaymentMethod"), value: "" },
                  { label: t("form.payment.none"), value: "NONE" },
                  { label: t("form.payment.cash"), value: "CASH" },
                  { label: t("form.payment.check"), value: "CHECK" },
                  { label: t("form.payment.card"), value: "BANK_CARD" },
                  { label: t("form.payment.transfer"), value: "BANK_TRANSFER" },
                ]}
              />

              <DateField
                id="updatePaymentDate"
                label={t("form.paymentDate")}
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <TextField
                id="readonlyStatus"
                label={t("modal.status")}
                value={procedure.payment_status || "NONE"}
                readOnly
                disabled
              />
              <TextField
                id="readonlyActualAmount"
                label={t("modal.paidAmount")}
                value={`€${((procedure.actual_payment_amount ?? 0) / 1000).toFixed(2)}`}
                readOnly
                disabled
              />
            </div>
          </div>
        </div>
      </form>

      {/* Footer */}
      <div className="flex gap-3 p-5">
        <Button
          type="button"
          onClick={onClose}
          variant="secondary"
          disabled={loading}
          className="flex-1"
        >
          {tc("action.cancel")}
        </Button>
        <Button
          type="submit"
          form="update-procedure-form"
          variant="primary"
          loading={loading}
          disabled={!patientId || !procedureTypeId || !procedureDate || loading}
          className="flex-1"
        >
          {loading ? t("action.updating") : t("action.update")}
        </Button>
      </div>
    </ModalContainer>
  );
}
