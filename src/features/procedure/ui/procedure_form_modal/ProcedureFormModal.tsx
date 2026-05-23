/**
 * ProcedureFormModal — Unified modal for creating, editing and viewing a procedure.
 *
 * mode="create":  ComboboxField for Patient (with inline creation, R9) and Fund
 *                 (search only), calls addProcedure on submit.
 * mode="edit":    ComboboxField for Patient (no inline creation, R29/R32), SelectField
 *                 for Fund, payment fields absent (R30), calls updateProcedure.
 * mode="view":    procedure_type_id editable only (R26), all other fields read-only,
 *                 patient displayed as "NOM (INS)" (R28), calls updateProcedure.
 *                 Shows "Refund" button for FundPaid/PartiallyFundPaid status (REF-010).
 * mode="overpaid": procedure_type_id editable only; shows "Cancel Refund" button (REF-190).
 * mode="refund":  all fields read-only; shows "Cancel Refund" button only (REF-200).
 */

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Procedure } from "@/bindings";
import { CancelRefundDialog } from "@/features/overpayment/cancel_refund_dialog/CancelRefundDialog";
import * as overpaymentGateway from "@/features/overpayment/gateway";
import { RecordOverpaymentModal } from "@/features/overpayment/record_overpayment_modal/RecordOverpaymentModal";
import { logger } from "@/infra/logger";
import { useAppStore } from "@/lib/appStore";
import {
  AmountField,
  Button,
  ComboboxField,
  DateField,
  IconButton,
  ModalContainer,
  SelectField,
  TextField,
} from "@/ui/components";
import { toastService } from "@/ui/components/snackbar";
import { useFormatters } from "@/ui/format/formatters";
import { formatPatientLabel } from "../../model";
import { CreatePatientForm } from "../form/CreatePatientForm";
import { useProcedureFormModal } from "./useProcedureFormModal";

interface ProcedureFormModalProps {
  mode: "create" | "edit" | "view" | "overpaid" | "refund";
  procedure?: Procedure | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ProcedureFormModal({
  mode,
  procedure,
  isOpen,
  onClose,
  onSuccess,
}: ProcedureFormModalProps) {
  const { t } = useTranslation("procedure");
  const { t: tc } = useTranslation("common");
  const { t: tov } = useTranslation("overpayment");
  const { formatCurrency, formatDate } = useFormatters();
  const bankAccounts = useAppStore((state) => state.bankAccounts);

  const [showRefundModal, setShowRefundModal] = useState(false);
  const [showCancelRefundDialog, setShowCancelRefundDialog] = useState(false);
  const [cancelSourceProcedureId, setCancelSourceProcedureId] = useState<string | null>(null);

  useEffect(() => {
    logger.info("[ProcedureFormModal] Mounted");
  }, []);

  // Reset sub-modal state when the main modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowRefundModal(false);
      setShowCancelRefundDialog(false);
      setCancelSourceProcedureId(null);
    }
  }, [isOpen]);

  const {
    patientItems,
    sortedFunds,
    procedureTypes,
    selectedPatient,
    patientId,
    handlePatientChange,
    fundId,
    setFundId,
    procedureTypeId,
    setProcedureTypeId,
    procedureDate,
    setProcedureDate,
    billedAmount,
    setBilledAmount,
    loading,
    fieldErrors,
    handleSubmit,
    patientModal,
    setPatientModal,
    handlePatientCreated,
  } = useProcedureFormModal({
    mode: mode === "overpaid" || mode === "refund" ? "view" : mode,
    procedure,
    onSuccess,
    onClose,
  });

  const isReadOnlyMode = mode === "view" || mode === "overpaid" || mode === "refund";
  const isRefundMode = mode === "refund";
  const isOverpaidMode = mode === "overpaid";

  const title = (() => {
    if (mode === "create") return t("form.cardTitle");
    if (mode === "overpaid") return tov("modal.viewTitle");
    if (mode === "refund") return tov("modal.refundViewTitle");
    if (mode === "view") return t("modal.viewTitle");
    return t("modal.title");
  })();

  const submitLabel = loading ? t("action.updating") : t("action.update");

  // Overpaid mode: procedure_type_id is editable (REF-190), same as view mode
  // Refund mode: all read-only (REF-200)
  const isProcedureTypeEditable = mode !== "refund";

  // "Refund" button: shown in view mode for FundPaid/PartiallyFundPaid (REF-010)
  const canShowRefundButton =
    mode === "view" &&
    (procedure?.payment_status === "FUND_PAID" ||
      procedure?.payment_status === "PARTIALLY_FUND_PAID");

  const handleRefundClick = () => setShowRefundModal(true);

  const handleCancelRefundClick = async () => {
    if (isOverpaidMode && procedure) {
      // Source procedure is Overpaid — cancel directly
      setCancelSourceProcedureId(procedure.id);
      setShowCancelRefundDialog(true);
    } else if (isRefundMode && procedure) {
      // Refund procedure — resolve source_procedure_id via refund_procedure_id (REF-200)
      try {
        const result = await overpaymentGateway.getProcedureRefundByRefundProcedure(procedure.id);
        if (result.success && result.data) {
          setCancelSourceProcedureId(result.data.source_procedure_id);
          setShowCancelRefundDialog(true);
        } else {
          logger.error(
            "[ProcedureFormModal] Could not resolve source procedure for refund cancel",
            {
              error: result.error,
            },
          );
          toastService.show("error", result.error ?? tc("error.unknown"));
        }
      } catch (err) {
        logger.error("[ProcedureFormModal] Exception resolving source procedure", { err });
        toastService.show("error", err instanceof Error ? err.message : tc("error.unknown"));
      }
    }
  };

  const handleRefundSuccess = () => {
    setShowRefundModal(false);
    onSuccess?.();
    onClose();
  };

  const handleCancelRefundSuccess = () => {
    setShowCancelRefundDialog(false);
    onSuccess?.();
    onClose();
  };

  const procedureTypeOptions = [
    { value: "", label: t("form.noSelection") },
    ...procedureTypes.map((pt) => ({ value: pt.id, label: pt.name })),
  ];

  return (
    <>
      <ModalContainer
        id="procedure-form-modal"
        isOpen={isOpen}
        onClose={onClose}
        maxWidth="max-w-2xl"
        titleId="procedure-form-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5">
          <h2 id="procedure-form-modal-title" className="text-xl font-semibold text-m3-on-surface">
            {title}
          </h2>
          <IconButton
            variant="ghost"
            shape="round"
            size="sm"
            aria-label={t("modal.closeAriaLabel")}
            icon={<X size={18} />}
            onClick={onClose}
          />
        </div>

        {/* Scrollable form body */}
        <form
          id="procedure-form"
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-5 flex flex-col gap-4"
        >
          {/* Patient — R28, R29, R32 */}
          {isReadOnlyMode ? (
            <TextField
              id="procedure-form-view-patient"
              label={t("form.patient")}
              value={selectedPatient ? formatPatientLabel(selectedPatient) : "—"}
              readOnly
            />
          ) : mode === "create" ? (
            <ComboboxField
              id="procedure-form-patient"
              label={t("form.patient")}
              items={patientItems}
              displayKey="label"
              idKey="id"
              priorityKey="hasSsn"
              value={patientId}
              onChange={handlePatientChange}
              placeholder={t("form.selectPatient")}
              onCreateNew={(q) => setPatientModal({ open: true, query: q })}
              createLabel={t("createPatient.submit")}
              error={fieldErrors.patientId}
            />
          ) : (
            <ComboboxField
              id="procedure-form-update-patient"
              label={t("form.patient")}
              items={patientItems}
              displayKey="label"
              idKey="id"
              priorityKey="hasSsn"
              value={patientId}
              onChange={handlePatientChange}
              placeholder={t("form.selectPatient")}
              error={fieldErrors.patientId}
            />
          )}

          {/* Fund */}
          {isReadOnlyMode ? (
            <TextField
              id="procedure-form-view-fund"
              label={t("form.fund")}
              value={sortedFunds.find((f) => f.id === fundId)?.fund_identifier ?? "—"}
              readOnly
            />
          ) : mode === "create" ? (
            <ComboboxField
              id="procedure-form-fund"
              label={t("form.fund")}
              items={sortedFunds}
              displayKey="fund_identifier"
              idKey="id"
              searchKeys={["fund_identifier", "name"]}
              value={fundId}
              onChange={setFundId}
              placeholder={t("form.selectFund")}
            />
          ) : (
            <SelectField
              id="procedure-form-update-fund"
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
          )}

          {/* Procedure Type — editable except in refund mode (R26, REF-190, REF-200) */}
          {isProcedureTypeEditable ? (
            <SelectField
              id="procedure-form-type"
              label={t("form.procedureType")}
              options={procedureTypeOptions}
              value={procedureTypeId}
              onChange={(e) => setProcedureTypeId(e.target.value)}
              disabled={loading}
              error={fieldErrors.procedureTypeId}
            />
          ) : (
            <TextField
              id="procedure-form-view-type"
              label={t("form.procedureType")}
              value={procedureTypes.find((pt) => pt.id === procedureTypeId)?.name ?? "—"}
              readOnly
            />
          )}

          {/* Date */}
          {isReadOnlyMode ? (
            <TextField
              id="procedure-form-view-date"
              label={t("form.procedureDate")}
              value={procedureDate ? formatDate(procedureDate) : "—"}
              readOnly
            />
          ) : (
            <DateField
              id="procedure-form-date"
              label={t("form.procedureDate")}
              value={procedureDate}
              onChange={(e) => setProcedureDate(e.target.value)}
              disabled={loading}
              error={fieldErrors.procedureDate}
            />
          )}

          {/* Amount */}
          {isReadOnlyMode ? (
            <TextField
              id="procedure-form-view-amount"
              label={t("form.amount")}
              value={billedAmount != null ? formatCurrency(Math.round(billedAmount * 1000)) : "—"}
              readOnly
            />
          ) : (
            <AmountField
              id="procedure-form-amount"
              label={t("form.amount")}
              value={billedAmount}
              onChange={setBilledAmount}
              disabled={loading}
            />
          )}
        </form>

        {/* Footer
            Layout by mode:
            - create/edit: [Cancel secondary] [Add/Update primary]
            - view:        [Close secondary]  [Refund primary?]
            - overpaid:    [Close secondary]  [Cancel Refund danger]  [Save primary]
            - refund:      [Close secondary]  [Cancel Refund danger]
            Destructive actions are placed after the neutral close/cancel (M3 convention). */}
        <div className="flex gap-3 p-5 bg-m3-surface-container-low">
          {/* Close / Cancel — always leftmost */}
          <Button
            type="button"
            onClick={onClose}
            variant="secondary"
            disabled={loading}
            className="flex-1"
          >
            {isReadOnlyMode ? tc("action.close") : tc("action.cancel")}
          </Button>

          {/* Refund button — view mode with FundPaid/PartiallyFundPaid (REF-010, REF-070) */}
          {canShowRefundButton && (
            <span
              title={bankAccounts.length === 0 ? tov("noAccountTooltip") : undefined}
              className="flex-1"
            >
              <Button
                type="button"
                onClick={handleRefundClick}
                variant="primary"
                disabled={bankAccounts.length === 0 || loading}
                className="w-full"
              >
                {tov("action.refund")}
              </Button>
            </span>
          )}

          {/* Cancel Refund — after Close in overpaid/refund modes (REF-190, REF-200) */}
          {(isOverpaidMode || isRefundMode) && (
            <Button
              type="button"
              onClick={handleCancelRefundClick}
              variant="danger"
              disabled={loading}
              className="flex-1"
            >
              {tov("action.cancelRefund")}
            </Button>
          )}

          {/* Save — create and edit modes */}
          {!isRefundMode &&
            !isReadOnlyMode &&
            (mode === "create" ? (
              <Button
                type="submit"
                form="procedure-form"
                variant="primary"
                loading={loading}
                disabled={!patientId || !procedureTypeId || !procedureDate || loading}
                className="flex-1"
              >
                {loading ? t("action.adding") : t("action.add")}
              </Button>
            ) : (
              <Button
                type="submit"
                form="procedure-form"
                variant="primary"
                loading={loading}
                disabled={!patientId || !procedureTypeId || !procedureDate || loading}
                className="flex-1"
              >
                {submitLabel}
              </Button>
            ))}

          {/* Save — overpaid mode (procedure_type_id only, REF-190) */}
          {isOverpaidMode && (
            <Button
              type="submit"
              form="procedure-form"
              variant="primary"
              loading={loading}
              disabled={!procedureTypeId || loading}
              className="flex-1"
            >
              {submitLabel}
            </Button>
          )}
        </div>
      </ModalContainer>

      {/* Patient creation modal — create mode only (R9) */}
      {mode === "create" && (
        <CreatePatientForm
          isOpen={patientModal.open}
          initialQuery={patientModal.query}
          onClose={() => setPatientModal({ open: false, query: "" })}
          onSubmit={handlePatientCreated}
        />
      )}

      {/* Record Overpayment modal — view mode with eligible procedure (REF-010) */}
      {showRefundModal && procedure && (
        <RecordOverpaymentModal
          isOpen={showRefundModal}
          sourceProcedure={procedure}
          patientLabel={selectedPatient ? formatPatientLabel(selectedPatient) : "—"}
          onClose={() => setShowRefundModal(false)}
          onSuccess={handleRefundSuccess}
        />
      )}

      {/* Cancel Refund dialog — overpaid or refund mode (REF-210) */}
      {showCancelRefundDialog && cancelSourceProcedureId && (
        <CancelRefundDialog
          isOpen={showCancelRefundDialog}
          sourceProcedureId={cancelSourceProcedureId}
          onClose={() => setShowCancelRefundDialog(false)}
          onSuccess={handleCancelRefundSuccess}
        />
      )}
    </>
  );
}
