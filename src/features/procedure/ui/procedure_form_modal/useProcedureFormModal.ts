/**
 * useProcedureFormModal — unified hook for create, edit and view procedure modal.
 *
 * Create mode: auto-fill from patient history (R4), patient inline creation (R9),
 *              calls addProcedure on submit.
 * Edit mode:   initialises from existing Procedure, ComboboxField for patient (R29),
 *              calls updateProcedure (payment fields passed through unchanged).
 * View mode:   procedure_type_id editable only (R26), calls updateProcedure with
 *              all other fields preserved from the original procedure.
 */

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Patient, Procedure, ProcedureEdit, ProcedureOrchestrationError } from "@/bindings";
import { formatPatientError } from "@/features/patient/shared/presenter";
import { useCacheStore } from "@/infra/cache/store";
import { logger } from "@/infra/logger";
import { toastService } from "@/ui/components/snackbar";
import * as gateway from "../../api/gateway";
import { formatPatientLabel } from "../../model";
import {
  formatProcedureOrchestrationError,
  type ProcedureFormField,
  patientNameErrorKey,
  procedureFieldErrorKeys,
} from "../../shared/presenter";

const TAG = "[useProcedureFormModal]";

type FieldErrors = Partial<Record<ProcedureFormField, string>>;

interface UseProcedureFormModalOptions {
  mode: "create" | "edit" | "view";
  procedure?: Procedure | null;
  onSuccess?: () => void;
  onClose: () => void;
}

export function useProcedureFormModal({
  mode,
  procedure,
  onSuccess,
  onClose,
}: UseProcedureFormModalOptions) {
  const { t } = useTranslation("procedure");
  const { t: tc } = useTranslation("common");

  const patients = useCacheStore((state) => state.patients);
  const funds = useCacheStore((state) => state.funds);
  const procedureTypes = useCacheStore((state) => state.procedureTypes);

  // Form state
  const [patientId, setPatientId] = useState(procedure?.patient_id ?? "");
  const [fundId, setFundId] = useState(procedure?.fund_id ?? "");
  const [procedureTypeId, setProcedureTypeId] = useState(procedure?.procedure_type_id ?? "");
  const [procedureDate, setProcedureDate] = useState(procedure?.procedure_date ?? "");
  const [billedAmount, setBilledAmount] = useState<number | null>(
    procedure?.billed_amount != null ? procedure.billed_amount / 1000 : null,
  );
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Creation modal state (create mode only)
  const [patientModal, setPatientModal] = useState({ open: false, query: "" });

  // Extract primitives to use as stable effect deps (avoids object identity issues)
  const initPatientId = procedure?.patient_id ?? "";
  const initFundId = procedure?.fund_id ?? "";
  const initProcedureTypeId = procedure?.procedure_type_id ?? "";
  const initProcedureDate = procedure?.procedure_date ?? "";
  const initBilledAmount = procedure?.billed_amount ?? null;

  // Reset form when procedure changes (edit/view modal re-opened with different row)
  useEffect(() => {
    setPatientId(initPatientId);
    setFundId(initFundId);
    setProcedureTypeId(initProcedureTypeId);
    setProcedureDate(initProcedureDate);
    setBilledAmount(initBilledAmount != null ? initBilledAmount / 1000 : null);
    setFieldErrors({});
  }, [initPatientId, initFundId, initProcedureTypeId, initProcedureDate, initBilledAmount]);

  // PRO-120: a refused field's message clears once that field is edited.
  const clearFieldError = useCallback((field: ProcedureFormField) => {
    setFieldErrors((prev) => {
      if (!(field in prev)) return prev;
      const { [field]: _cleared, ...rest } = prev;
      return rest;
    });
  }, []);

  const changeProcedureDate = useCallback(
    (date: string) => {
      setProcedureDate(date);
      clearFieldError("procedureDate");
    },
    [clearFieldError],
  );

  // Auto-fill on patient selection (create mode only, PRO-020).
  // Each field is propagated only when it is still in its not-initialized state
  // (the user has not entered a value).
  const handlePatientChange = useCallback(
    (id: string) => {
      setPatientId(id);
      clearFieldError("patientId");
      if (!id || mode !== "create") return;
      const patient = patients.find((p) => p.id === id);
      if (!patient) return;
      if (!fundId && patient.latest_fund) setFundId(patient.latest_fund);
      if (
        !procedureTypeId &&
        patient.latest_procedure_type &&
        procedureTypes.some((pt) => pt.id === patient.latest_procedure_type)
      )
        setProcedureTypeId(patient.latest_procedure_type);
      if (!procedureDate) changeProcedureDate(new Date().toISOString().split("T")[0] ?? "");
      if (billedAmount == null && patient.latest_procedure_amount != null)
        setBilledAmount(patient.latest_procedure_amount / 1000);
    },
    [
      patients,
      procedureTypes,
      procedureTypeId,
      fundId,
      procedureDate,
      billedAmount,
      mode,
      clearFieldError,
      changeProcedureDate,
    ],
  );

  // Auto-fill amount on procedure type selection (create mode only, PRO-025).
  // Amount is propagated only when it is still in its not-initialized state.
  const handleProcedureTypeChange = useCallback(
    (id: string) => {
      setProcedureTypeId(id);
      clearFieldError("procedureTypeId");
      if (!id || mode !== "create") return;
      if (billedAmount != null) return;
      const procedureType = procedureTypes.find((pt) => pt.id === id);
      if (procedureType) setBilledAmount(procedureType.default_amount / 1000);
    },
    [procedureTypes, billedAmount, mode, clearFieldError],
  );

  const reset = useCallback(() => {
    setPatientId("");
    setFundId("");
    setProcedureTypeId("");
    setProcedureDate("");
    setBilledAmount(null);
    setFieldErrors({});
  }, []);

  // A thrown call (IPC failure) ends like a refused one: loading cleared, an error shown (PRO-050, PRO-190).
  const callGateway = useCallback(
    async <T>(call: () => Promise<T>): Promise<T | null> => {
      try {
        return await call();
      } catch (err) {
        logger.error(`${TAG} Gateway call threw`, { err });
        toastService.show("error", tc("error.unknown"));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [tc],
  );

  // A refusal (PRO-120): each refused field gets its message under it, and a toast says why.
  const showRefusal = useCallback(
    (error: ProcedureOrchestrationError, context: string) => {
      logger.error(`${TAG} Refused`, { context, code: error.code });
      const fieldKeys = procedureFieldErrorKeys(error);
      if (fieldKeys) {
        setFieldErrors(
          Object.fromEntries(Object.entries(fieldKeys).map(([field, key]) => [field, t(key)])),
        );
      }
      const { key, params } = formatProcedureOrchestrationError(error);
      toastService.show("error", t(key, params));
    },
    [t],
  );

  // PRO-255: an edit answered unchanged closes the dialog without a message.
  const finishEdit = useCallback(
    (edit: ProcedureEdit) => {
      if (edit.outcome === "Updated") {
        toastService.show("success", t("state.updated"));
        onSuccess?.();
      }
      onClose();
    },
    [t, onSuccess, onClose],
  );

  // The backend judges the form (TODO-024): Save sends it as it is, whatever is missing.
  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (mode !== "create" && !procedure) return;
      setFieldErrors({});
      setLoading(true);

      if (mode === "view" && procedure) {
        // View mode: only procedure_type_id is editable (R26)
        const result = await callGateway(() =>
          gateway.updateProcedure({
            id: procedure.id,
            patient_id: procedure.patient_id,
            fund_id: procedure.fund_id,
            procedure_type_id: procedureTypeId,
            procedure_date: procedure.procedure_date,
            billed_amount: procedure.billed_amount,
            payment_method: procedure.payment_method,
            fund_reconciliation_date: procedure.fund_reconciliation_date || null,
            confirmed_payment_date: procedure.confirmed_payment_date || null,
            paid_amount: procedure.paid_amount,
            payment_status: procedure.payment_status,
          }),
        );
        if (!result) return;
        if (!result.success) {
          showRefusal(result.error, "Error updating procedure type in view mode");
          return;
        }
        finishEdit(result.data);
        return;
      }

      if (mode === "create") {
        const result = await callGateway(() =>
          gateway.addProcedure(
            patientId,
            fundId || null,
            procedureTypeId,
            procedureDate,
            Math.round((billedAmount ?? 0) * 1000),
          ),
        );
        if (!result) return;
        if (!result.success) {
          showRefusal(result.error, "Error submitting");
          return;
        }
        logger.info(`${TAG} Procedure added`, { id: result.data.id });
        reset();
        toastService.show("success", t("state.added"));
        onSuccess?.();
        onClose();
        return;
      }

      if (!procedure) return;
      // Edit mode: payment fields passed through unchanged from original procedure (PRO-050)
      const result = await callGateway(() =>
        gateway.updateProcedure({
          id: procedure.id,
          patient_id: patientId,
          fund_id: fundId || null,
          procedure_type_id: procedureTypeId,
          procedure_date: procedureDate,
          billed_amount: Math.round((billedAmount ?? 0) * 1000),
          payment_method: procedure.payment_method,
          fund_reconciliation_date: procedure.fund_reconciliation_date || null,
          confirmed_payment_date: procedure.confirmed_payment_date || null,
          paid_amount: procedure.paid_amount,
          payment_status: procedure.payment_status,
        }),
      );
      if (!result) return;
      if (!result.success) {
        showRefusal(result.error, "Error submitting");
        return;
      }
      finishEdit(result.data);
    },
    [
      mode,
      procedure,
      procedureTypeId,
      patientId,
      fundId,
      procedureDate,
      billedAmount,
      t,
      onSuccess,
      onClose,
      reset,
      callGateway,
      showRefusal,
      finishEdit,
    ],
  );

  // Patient inline creation handler (create mode only, R9)
  // Returns the new-patient form's messages: under a field, or `submit` for the form (TODO-026); none on success.
  const handlePatientCreated = useCallback(
    async (data: { name: string; ssn?: string }): Promise<Record<string, string>> => {
      const result = await gateway.createNewPatient(data.name, data.ssn ?? null);
      if (!result.success) {
        logger.error(`${TAG} Error creating patient`, { code: result.error.code });
        const nameKey = patientNameErrorKey(result.error);
        if (nameKey) return { name: t(nameKey) };
        // A refusal that names no field keeps the form open, its reason shown in it (F30).
        const { key, params } = formatPatientError(result.error);
        return { submit: t(key, params) || tc("error.unknown") };
      }
      const patient: Patient = result.data;
      setPatientId(patient.id);
      clearFieldError("patientId");
      setPatientModal({ open: false, query: "" });
      return {};
    },
    [t, tc, clearFieldError],
  );

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === patientId),
    [patients, patientId],
  );
  const sortedFunds = useMemo(
    () => funds.toSorted((a, b) => a.fund_identifier.localeCompare(b.fund_identifier)),
    [funds],
  );

  // Patient items formatted with INS for ComboboxField (R28, R31).
  // `hasSsn` flag opts the combobox into surfacing SSN-bearing patients first
  // (matches the priorityKey contract on ComboboxField).
  const patientItems = useMemo(
    () =>
      patients.map((p) => ({
        id: p.id,
        label: formatPatientLabel(p),
        hasSsn: !!p.ssn,
      })),
    [patients],
  );

  return {
    // Reference data
    patientItems,
    sortedFunds,
    procedureTypes,
    // Derived
    selectedPatient,
    // Form state
    patientId,
    handlePatientChange,
    fundId,
    setFundId,
    procedureTypeId,
    setProcedureTypeId,
    handleProcedureTypeChange,
    procedureDate,
    setProcedureDate: changeProcedureDate,
    billedAmount,
    setBilledAmount,
    loading,
    fieldErrors,
    handleSubmit,
    // Creation modals (create mode only)
    patientModal,
    setPatientModal,
    handlePatientCreated,
  };
}
