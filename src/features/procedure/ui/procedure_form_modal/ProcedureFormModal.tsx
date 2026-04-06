/**
 * ProcedureFormModal — Unified modal for creating, editing and viewing a procedure.
 *
 * mode="create": ComboboxField for Patient (with inline creation, R9) and Fund
 *                (search only), calls addProcedure on submit.
 * mode="edit":   ComboboxField for Patient (no inline creation, R29/R32), SelectField
 *                for Fund, payment fields absent (R30), calls updateProcedure.
 * mode="view":   procedure_type_id editable only (R26), all other fields read-only,
 *                patient displayed as "NOM (INS)" (R28), calls updateProcedure.
 */

import { X } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { Procedure } from "@/bindings";
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
import { formatPatientLabel } from "../../model";
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
  const { formatCurrency, formatDate } = useFormatters();

  useEffect(() => {
    logger.info("[ProcedureFormModal] Mounted");
  }, []);

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
    procedureAmount,
    setProcedureAmount,
    loading,
    fieldErrors,
    handleSubmit,
    patientModal,
    setPatientModal,
    handlePatientCreated,
  } = useProcedureFormModal({ mode, procedure, onSuccess, onClose });

  const isViewMode = mode === "view";
  const title =
    mode === "create" ? t("form.cardTitle") : isViewMode ? t("modal.viewTitle") : t("modal.title");
  const submitLabel = loading ? t("action.updating") : t("action.update");

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
          {/* Patient — R28, R29, R32 */}
          {isViewMode ? (
            <TextField
              id="viewPatient"
              label={t("form.patient")}
              value={selectedPatient ? formatPatientLabel(selectedPatient) : "—"}
              readOnly
            />
          ) : mode === "create" ? (
            <ComboboxField
              id="procedurePatient"
              label={t("form.patient")}
              items={patientItems}
              displayKey="label"
              idKey="id"
              value={patientId}
              onChange={handlePatientChange}
              placeholder={t("form.selectPatient")}
              onCreateNew={(q) => setPatientModal({ open: true, query: q })}
              createLabel={t("createPatient.submit")}
              error={fieldErrors.patientId}
            />
          ) : (
            <ComboboxField
              id="updatePatient"
              label={t("form.patient")}
              items={patientItems}
              displayKey="label"
              idKey="id"
              value={patientId}
              onChange={handlePatientChange}
              placeholder={t("form.selectPatient")}
              error={fieldErrors.patientId}
            />
          )}

          {/* Fund */}
          {isViewMode ? (
            <TextField
              id="viewFund"
              label={t("form.fund")}
              value={sortedFunds.find((f) => f.id === fundId)?.fund_identifier ?? "—"}
              readOnly
            />
          ) : mode === "create" ? (
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
            />
          ) : (
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
          )}

          {/* Procedure Type — editable in all modes (R26) */}
          <SelectField
            id="procedureType"
            label={t("form.procedureType")}
            options={procedureTypeOptions}
            value={procedureTypeId}
            onChange={(e) => setProcedureTypeId(e.target.value)}
            disabled={loading}
            error={fieldErrors.procedureTypeId}
          />

          {/* Date */}
          {isViewMode ? (
            <TextField
              id="viewDate"
              label={t("form.procedureDate")}
              value={procedureDate ? formatDate(procedureDate) : "—"}
              readOnly
            />
          ) : (
            <DateField
              id="procedureDate"
              label={t("form.procedureDate")}
              value={procedureDate}
              onChange={(e) => setProcedureDate(e.target.value)}
              disabled={loading}
              error={fieldErrors.procedureDate}
            />
          )}

          {/* Amount */}
          {isViewMode ? (
            <TextField
              id="viewAmount"
              label={t("form.amount")}
              value={
                procedureAmount != null ? formatCurrency(Math.round(procedureAmount * 1000)) : "—"
              }
              readOnly
            />
          ) : (
            <AmountField
              id="procedureAmount"
              label={t("form.amount")}
              value={procedureAmount}
              onChange={setProcedureAmount}
              disabled={loading}
            />
          )}
        </form>

        {/* Footer */}
        <div className="flex gap-3 p-5 bg-m3-surface-container-low">
          <Button
            type="button"
            onClick={onClose}
            variant="secondary"
            disabled={loading}
            className="flex-1"
          >
            {isViewMode ? tc("action.close") : tc("action.cancel")}
          </Button>
          {mode === "create" ? (
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
              disabled={
                isViewMode
                  ? !procedureTypeId || loading
                  : !patientId || !procedureTypeId || !procedureDate || loading
              }
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
    </>
  );
}
