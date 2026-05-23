/**
 * RecordOverpaymentModal — collects refund details and submits the overpayment creation request.
 *
 * Two-step flow:
 *   Step 1 (form): user fills refund date, payment method, bank account, reason.
 *   Step 2 (confirm): summary is shown; confirm button triggers the async gateway call
 *                     with a loading state. The dialog stays open until the call resolves.
 *
 * Using an inline confirmation step (not ConfirmationDialog) so the modal remains mounted
 * during the async window and the confirm button can carry a loading/disabled state.
 *
 * REF-030: refundDate validation.
 * REF-040: reason max 255 chars.
 * REF-060: transferType restricted to CreditCard, Check, OutgoingWire.
 * REF-070: bankAccount required; pre-filled if single account exists.
 */

import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Procedure } from "@/bindings";
import {
  Button,
  DateField,
  IconButton,
  ModalContainer,
  SelectField,
  TextField,
} from "@/ui/components";
import { useFormatters } from "@/ui/format/formatters";
import { useRecordOverpaymentModal } from "./useRecordOverpaymentModal";

interface RecordOverpaymentModalProps {
  isOpen: boolean;
  sourceProcedure: Procedure;
  /** Patient display name for the source procedure summary. */
  patientLabel: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function RecordOverpaymentModal({
  isOpen,
  sourceProcedure,
  patientLabel,
  onClose,
  onSuccess,
}: RecordOverpaymentModalProps) {
  const { t } = useTranslation("overpayment");
  const { t: tc } = useTranslation("common");
  const { formatCurrency, formatDate } = useFormatters();

  const {
    bankAccounts,
    refundDate,
    setRefundDate,
    transferType,
    setTransferType,
    bankAccountId,
    setBankAccountId,
    reason,
    setReason,
    loading,
    fieldErrors,
    showConfirmation,
    handleSubmit,
    handleConfirm,
    handleCancelConfirmation,
  } = useRecordOverpaymentModal({ sourceProcedure, onSuccess, onClose });

  const transferTypeOptions = [
    { value: "", label: t("form.selectPaymentMethod") },
    { value: "CreditCard", label: t("paymentMethod.creditCard") },
    { value: "Check", label: t("paymentMethod.check") },
    { value: "OutgoingWire", label: t("paymentMethod.outgoingWire") },
  ];

  const bankAccountOptions = [
    { value: "", label: t("form.selectBankAccount") },
    ...bankAccounts.map((a) => ({ value: a.id, label: a.name })),
  ];

  const selectedBankAccountName = bankAccounts.find((a) => a.id === bankAccountId)?.name ?? "—";

  const selectedTransferTypeLabel =
    transferTypeOptions.find((o) => o.value === transferType)?.label ?? "—";

  return (
    <ModalContainer
      id="record-overpayment-modal"
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-2xl"
      titleId="record-overpayment-modal-title"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-5">
        <h2
          id="record-overpayment-modal-title"
          className="text-xl font-semibold text-m3-on-surface"
        >
          {showConfirmation ? t("modal.confirmTitle") : t("modal.title")}
        </h2>
        <IconButton
          variant="ghost"
          shape="round"
          size="sm"
          aria-label={t("modal.closeAriaLabel")}
          icon={<X size={18} />}
          onClick={onClose}
          disabled={loading}
        />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
        {!showConfirmation ? (
          /* ── Step 1: Form ── */
          <>
            {/* Source procedure summary */}
            <TextField
              id="sourceProcedurePatient"
              label={t("form.sourceProcedure")}
              value={`${patientLabel} — ${formatCurrency(sourceProcedure.billed_amount ?? 0)} (${formatDate(sourceProcedure.procedure_date)})`}
              readOnly
            />

            {/* Refund date (REF-030) */}
            <DateField
              id="refundDate"
              label={t("form.refundDate")}
              value={refundDate}
              onChange={(e) => setRefundDate(e.target.value)}
              disabled={loading}
              error={fieldErrors.refundDate}
            />

            {/* Transfer type (REF-060) */}
            <SelectField
              id="transferType"
              label={t("form.paymentMethod")}
              options={transferTypeOptions}
              value={transferType}
              onChange={(e) => setTransferType(e.target.value)}
              disabled={loading}
              error={fieldErrors.transferType}
            />

            {/* Bank account (REF-070) */}
            <SelectField
              id="bankAccount"
              label={t("form.bankAccount")}
              options={bankAccountOptions}
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              disabled={loading}
              error={fieldErrors.bankAccountId}
            />

            {/* Reason (REF-040) */}
            <TextField
              id="reason"
              label={t("form.reason")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={loading}
              error={fieldErrors.reason}
            />
          </>
        ) : (
          /* ── Step 2: Confirmation summary ── */
          <>
            <p className="text-sm text-m3-on-surface-variant">{t("modal.confirmBody")}</p>
            <TextField
              id="confirmPatient"
              label={t("form.sourceProcedure")}
              value={`${patientLabel} — ${formatCurrency(sourceProcedure.billed_amount ?? 0)}`}
              readOnly
            />
            <TextField
              id="confirmDate"
              label={t("form.refundDate")}
              value={formatDate(refundDate)}
              readOnly
            />
            <TextField
              id="confirmPaymentMethod"
              label={t("form.paymentMethod")}
              value={selectedTransferTypeLabel}
              readOnly
            />
            <TextField
              id="confirmBankAccount"
              label={t("form.bankAccount")}
              value={selectedBankAccountName}
              readOnly
            />
            {reason && (
              <TextField id="confirmReason" label={t("form.reason")} value={reason} readOnly />
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex gap-3 p-5 bg-m3-surface-container-low">
        {!showConfirmation ? (
          <>
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
              type="button"
              onClick={handleSubmit}
              variant="primary"
              disabled={!refundDate || !transferType || !bankAccountId || loading}
              className="flex-1"
            >
              {t("action.confirmRefund")}
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              onClick={handleCancelConfirmation}
              variant="secondary"
              disabled={loading}
              className="flex-1"
            >
              {tc("action.cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              variant="primary"
              loading={loading}
              disabled={loading}
              className="flex-1"
            >
              {t("action.confirmRefund")}
            </Button>
          </>
        )}
      </div>
    </ModalContainer>
  );
}
