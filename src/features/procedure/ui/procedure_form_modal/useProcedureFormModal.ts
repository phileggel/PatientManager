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
import type { Patient, Procedure } from "@/bindings";
import { logger } from "@/infra/logger";
import { useAppStore } from "@/lib/appStore";
import { toastService } from "@/ui/components/snackbar";
import * as gateway from "../../api/gateway";
import { formatPatientLabel } from "../../model";

const TAG = "[useProcedureFormModal]";

function validateForm(
  patientId: string,
  procedureTypeId: string,
  procedureDate: string,
  t: (key: string) => string,
): FieldErrors {
  const errors: FieldErrors = {};
  if (!patientId) errors.patientId = t("error.requiredField");
  if (!procedureTypeId) errors.procedureTypeId = t("error.requiredField");
  if (!procedureDate) errors.procedureDate = t("error.requiredField");
  return errors;
}

interface FieldErrors {
  patientId?: string;
  procedureTypeId?: string;
  procedureDate?: string;
}

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

  const patients = useAppStore((state) => state.patients);
  const funds = useAppStore((state) => state.funds);
  const procedureTypes = useAppStore((state) => state.procedureTypes);

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

  // Auto-fill on patient selection (create mode only, R4)
  const handlePatientChange = useCallback(
    (id: string) => {
      setPatientId(id);
      if (!id || mode !== "create") return;
      const patient = patients.find((p) => p.id === id);
      if (!patient) return;
      if (!fundId && patient.latest_fund) setFundId(patient.latest_fund);
      if (
        patient.latest_procedure_type &&
        procedureTypes.some((pt) => pt.id === patient.latest_procedure_type)
      )
        setProcedureTypeId(patient.latest_procedure_type);
      if (!procedureDate) setProcedureDate(new Date().toISOString().split("T")[0] ?? "");
      if (billedAmount == null && patient.latest_procedure_amount != null)
        setBilledAmount(patient.latest_procedure_amount / 1000);
    },
    [patients, procedureTypes, fundId, procedureDate, billedAmount, mode],
  );

  const reset = useCallback(() => {
    setPatientId("");
    setFundId("");
    setProcedureTypeId("");
    setProcedureDate("");
    setBilledAmount(null);
    setFieldErrors({});
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();

      if (mode === "view") {
        // View mode: only procedure_type_id is editable (R26)
        if (!procedure || !procedureTypeId) return;
        setLoading(true);
        const result = await gateway.updateProcedure({
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
        });
        setLoading(false);
        if (!result.success) {
          logger.error(`${TAG} Error updating procedure type in view mode`, {
            error: result.error,
          });
          toastService.show("error", result.error || tc("error.unknown"));
          return;
        }
        toastService.show("success", t("state.updated"));
        onSuccess?.();
        onClose();
        return;
      }

      const errors = validateForm(patientId, procedureTypeId, procedureDate, t);
      if (Object.keys(errors).length > 0) {
        logger.warn(`${TAG} Submit with missing required fields`);
        setFieldErrors(errors);
        toastService.show("error", t("error.requiredFields"));
        return;
      }

      setFieldErrors({});
      setLoading(true);
      if (mode === "create") {
        const result = await gateway.addProcedure(
          patientId,
          fundId || null,
          procedureTypeId,
          procedureDate,
          billedAmount !== null ? Math.round(billedAmount * 1000) : null,
        );
        setLoading(false);
        if (!result.success) {
          logger.error(`${TAG} Error submitting`, { error: result.error });
          toastService.show("error", result.error || tc("error.unknown"));
          return;
        }
        logger.info(`${TAG} Procedure added`, { id: result.data.id });
        reset();
        toastService.show("success", t("state.added"));
        onSuccess?.();
        onClose();
      } else {
        // Edit mode: payment fields passed through unchanged from original procedure (PRO-050)
        if (!procedure) {
          setLoading(false);
          return;
        }
        const result = await gateway.updateProcedure({
          id: procedure.id,
          patient_id: patientId,
          fund_id: fundId || null,
          procedure_type_id: procedureTypeId,
          procedure_date: procedureDate,
          billed_amount: billedAmount != null ? Math.round(billedAmount * 1000) : null,
          payment_method: procedure.payment_method,
          fund_reconciliation_date: procedure.fund_reconciliation_date || null,
          confirmed_payment_date: procedure.confirmed_payment_date || null,
          paid_amount: procedure.paid_amount,
          payment_status: procedure.payment_status,
        });
        setLoading(false);
        if (!result.success) {
          logger.error(`${TAG} Error submitting`, { error: result.error });
          toastService.show("error", result.error || tc("error.unknown"));
          return;
        }
        toastService.show("success", t("state.updated"));
        onSuccess?.();
        onClose();
      }
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
      tc,
      onSuccess,
      onClose,
      reset,
    ],
  );

  // Patient inline creation handler (create mode only, R9)
  const handlePatientCreated = useCallback(
    async (data: { name: string; ssn?: string }) => {
      const result = await gateway.createNewPatient(data.name, data.ssn ?? null);
      if (!result.success) {
        logger.error(`${TAG} Error creating patient`, { error: result.error });
        toastService.show("error", result.error || tc("error.unknown"));
        return;
      }
      const patient: Patient = result.data;
      setPatientId(patient.id);
      setFieldErrors((prev) => ({ ...prev, patientId: undefined }));
      setPatientModal({ open: false, query: "" });
    },
    [tc],
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
    procedureDate,
    setProcedureDate,
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
