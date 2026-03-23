/**
 * ProcedureFormModal — Unified modal for creating, editing and viewing a procedure.
 *
 * mode="create": ComboboxField for Patient/Fund (with inline entity creation),
 *                payment fields editable, calls addProcedure on submit.
 * mode="edit":   SelectField for Patient/Fund, read-only sections for system
 *                info, patient info and payment status, calls updateProcedure.
 * mode="view":   All fields disabled, submit button hidden. Used for blocked-status
 *                procedures (R26) — linked to a payment group or bank transaction.
 */

import { X } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { PaymentMethod, Procedure } from "@/bindings";
import { useFormatters } from "@/lib/formatters";
import { logger } from "@/lib/logger";
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
import { CreateFundForm } from "../form/CreateFundForm";
import { CreatePatientForm } from "../form/CreatePatientForm";
import { useProcedureFormModal } from "./useProcedureFormModal";

interface ProcedureFormModalProps {
  mode: "create" | "edit" | "view";
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
  const { formatCurrency } = useFormatters();

  useEffect(() => {
    logger.info("[ProcedureFormModal] Mounted");
  }, []);

  const {
    patients,
    sortedFunds,
    procedureTypes,
    selectedPatient,
    selectedFund,
    patientId,
    handlePatientChange,
    fundId,
    setFundId,
    procedureTypeId,
    setProcedureTypeId,
    procedureDate,
    setProcedureDate,
    procedureAmount,
    setProcedureAmount,
    paymentMethod,
    setPaymentMethod,
    paymentDate,
    setPaymentDate,
    loading,
    fieldErrors,
    handleSubmit,
    patientModal,
    setPatientModal,
    fundModal,
    setFundModal,
    handlePatientCreated,
    handleFundCreated,
  } = useProcedureFormModal({ mode, procedure, onSuccess, onClose });

  const isViewMode = mode === "view";
  const title =
    mode === "create" ? t("form.cardTitle") : isViewMode ? t("modal.viewTitle") : t("modal.title");
  const submitLabel =
    mode === "create"
      ? loading
        ? t("action.adding")
        : t("action.add")
      : loading
        ? t("action.updating")
        : t("action.update");

  const paymentOptions = [
    { label: t("form.payment.none"), value: "NONE" },
    { label: t("form.payment.cash"), value: "CASH" },
    { label: t("form.payment.check"), value: "CHECK" },
    { label: t("form.payment.card"), value: "BANK_CARD" },
    { label: t("form.payment.transfer"), value: "BANK_TRANSFER" },
  ];

  const procedureTypeOptions = [
    { value: "", label: t("form.noSelection") },
    ...procedureTypes.map((pt) => ({ value: pt.id, label: pt.name })),
  ];

  return (
    <>
      <ModalContainer
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
          {/* Patient */}
          {mode === "create" ? (
            <ComboboxField
              id="procedurePatient"
              label={t("form.patient")}
              items={patients}
              displayKey="name"
              idKey="id"
              value={patientId}
              onChange={handlePatientChange}
              placeholder={t("form.selectPatient")}
              onCreateNew={(q) => setPatientModal({ open: true, query: q })}
              createLabel={t("createPatient.submit")}
              error={fieldErrors.patientId}
            />
          ) : (
            <SelectField
              id="updatePatient"
              label={t("form.patient")}
              value={patientId}
              onChange={(e) => handlePatientChange(e.target.value)}
              disabled={loading || isViewMode}
              error={fieldErrors.patientId}
              options={patients.map((p) => ({ label: p.name ?? "—", value: p.id }))}
            />
          )}

          {/* Fund */}
          {mode === "create" ? (
            <ComboboxField
              id="procedureFund"
              label={t("form.fund")}
              items={sortedFunds}
              displayKey="fund_identifier"
              idKey="id"
              searchKeys={["fund_identifier", "name"]}
              value={fundId}
              onChange={setFundId}
              placeholder={t("form.selectFund")}
              onCreateNew={(q) => setFundModal({ open: true, query: q })}
              createLabel={t("createFund.submit")}
            />
          ) : (
            <SelectField
              id="updateFund"
              label={t("form.fund")}
              value={fundId}
              onChange={(e) => setFundId(e.target.value)}
              disabled={loading || isViewMode}
              options={[
                { label: t("form.selectFund"), value: "" },
                ...sortedFunds.map((f) => ({
                  label: `${f.fund_identifier} (${f.name})`,
                  value: f.id,
                })),
              ]}
            />
          )}

          {/* Procedure Type */}
          <SelectField
            id="procedureType"
            label={t("form.procedureType")}
            options={procedureTypeOptions}
            value={procedureTypeId}
            onChange={(e) => setProcedureTypeId(e.target.value)}
            disabled={loading || isViewMode}
            error={fieldErrors.procedureTypeId}
          />

          {/* Date */}
          <DateField
            id="procedureDate"
            label={t("form.procedureDate")}
            value={procedureDate}
            onChange={(e) => setProcedureDate(e.target.value)}
            disabled={loading || isViewMode}
            error={fieldErrors.procedureDate}
          />

          {/* Amount */}
          <AmountField
            id="procedureAmount"
            label={t("form.amount")}
            value={procedureAmount}
            onChange={setProcedureAmount}
            disabled={loading || isViewMode}
          />

          {/* System Info — edit/view only */}
          {mode !== "create" && procedure && (
            <div className="bg-m3-surface-container-low rounded-xl p-4">
              <h3 className="text-sm font-semibold text-m3-on-surface-variant mb-3">
                {t("modal.systemInfo")}
              </h3>
              <TextField
                id="readonlyId"
                label={t("modal.procedureId")}
                value={procedure.id}
                readOnly
              />
            </div>
          )}

          {/* Patient Info — edit/view only */}
          {mode !== "create" && (
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
                />
                <TextField
                  id="readonlyFundName"
                  label={t("modal.fundName")}
                  value={selectedFund?.name || "—"}
                  readOnly
                />
              </div>
            </div>
          )}

          {/* Payment section */}
          <div className="bg-m3-surface-container-low rounded-xl p-4">
            <h3 className="text-sm font-semibold text-m3-on-surface-variant mb-3">
              {t("modal.paymentInfo")}
            </h3>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <SelectField
                  id="paymentMethod"
                  label={t("form.paymentMethod")}
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod | "")}
                  disabled={loading || isViewMode}
                  options={[{ label: t("form.selectPaymentMethod"), value: "" }, ...paymentOptions]}
                />
                <DateField
                  id="paymentDate"
                  label={t("form.paymentDate")}
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  disabled={loading || isViewMode}
                />
              </div>

              {/* Read-only payment status — edit/view only */}
              {mode !== "create" && procedure && (
                <div className="grid grid-cols-2 gap-4">
                  <TextField
                    id="readonlyStatus"
                    label={t("modal.status")}
                    value={(() => {
                      const upper = procedure.payment_status?.toUpperCase() ?? "";
                      const isAnyPayed = [
                        "DIRECTLY_PAYED",
                        "FUND_PAYED",
                        "IMPORT_DIRECTLY_PAYED",
                        "IMPORT_FUND_PAYED",
                      ].includes(upper);
                      const key = isAnyPayed
                        ? "payed"
                        : (procedure.payment_status?.toLowerCase() ?? "none");
                      return t(`status.${key}`, { defaultValue: "—" });
                    })()}
                    readOnly
                  />
                  <TextField
                    id="readonlyActualAmount"
                    label={t("modal.paidAmount")}
                    value={
                      procedure.actual_payment_amount != null
                        ? formatCurrency(procedure.actual_payment_amount)
                        : "—"
                    }
                    readOnly
                  />
                </div>
              )}
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex gap-3 p-5 border-t border-m3-outline-variant">
          <Button
            type="button"
            onClick={onClose}
            variant="secondary"
            disabled={loading}
            className="flex-1"
          >
            {isViewMode ? tc("action.close") : tc("action.cancel")}
          </Button>
          {!isViewMode && (
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
          )}
        </div>
      </ModalContainer>

      {/* Entity creation modals — create mode only */}
      {mode === "create" && (
        <>
          <CreatePatientForm
            isOpen={patientModal.open}
            initialQuery={patientModal.query}
            onClose={() => setPatientModal({ open: false, query: "" })}
            onSubmit={handlePatientCreated}
          />
          <CreateFundForm
            isOpen={fundModal.open}
            initialQuery={fundModal.query}
            onClose={() => setFundModal({ open: false, query: "" })}
            onSubmit={handleFundCreated}
          />
        </>
      )}
    </>
  );
}
