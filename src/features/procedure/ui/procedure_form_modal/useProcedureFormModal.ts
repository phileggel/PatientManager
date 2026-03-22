/**
 * useProcedureFormModal — unified hook for create and edit procedure modal.
 *
 * Create mode: auto-fill from patient, entity creation modals, calls addProcedure.
 * Edit mode:   initialises from existing Procedure, calls updateProcedure.
 */

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AffiliatedFund, Patient, PaymentMethod, Procedure } from "@/bindings";
import { toastService } from "@/core/snackbar";
import { useAppStore } from "@/lib/appStore";
import { logger } from "@/lib/logger";
import * as gateway from "../../api/gateway";

const TAG = "[useProcedureFormModal]";

interface FieldErrors {
  patientId?: string;
  procedureTypeId?: string;
  procedureDate?: string;
}

interface UseProcedureFormModalOptions {
  mode: "create" | "edit";
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
  const [procedureAmount, setProcedureAmount] = useState<number | null>(
    procedure?.procedure_amount != null ? procedure.procedure_amount / 1000 : null,
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">(
    procedure?.payment_method ?? "NONE",
  );
  const [paymentDate, setPaymentDate] = useState(procedure?.confirmed_payment_date ?? "");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Creation modal state (used in create mode)
  const [patientModal, setPatientModal] = useState({ open: false, query: "" });
  const [fundModal, setFundModal] = useState({ open: false, query: "" });

  // Extract primitives to use as stable effect deps (avoids object identity issues)
  const initPatientId = procedure?.patient_id ?? "";
  const initFundId = procedure?.fund_id ?? "";
  const initProcedureTypeId = procedure?.procedure_type_id ?? "";
  const initProcedureDate = procedure?.procedure_date ?? "";
  const initProcedureAmount = procedure?.procedure_amount ?? null;
  const initPaymentMethod = procedure?.payment_method ?? "NONE";
  const initPaymentDate = procedure?.confirmed_payment_date ?? "";

  // Reset form when procedure changes (edit modal re-opened with different row)
  useEffect(() => {
    setPatientId(initPatientId);
    setFundId(initFundId);
    setProcedureTypeId(initProcedureTypeId);
    setProcedureDate(initProcedureDate);
    setProcedureAmount(initProcedureAmount != null ? initProcedureAmount / 1000 : null);
    setPaymentMethod(initPaymentMethod);
    setPaymentDate(initPaymentDate);
    setFieldErrors({});
  }, [
    initPatientId,
    initFundId,
    initProcedureTypeId,
    initProcedureDate,
    initProcedureAmount,
    initPaymentMethod,
    initPaymentDate,
  ]);

  // Auto-fill on patient selection (create mode only, R4)
  const handlePatientChange = useCallback(
    (id: string) => {
      setPatientId(id);
      if (!id || mode !== "create") return;
      const patient = patients.find((p) => p.id === id);
      if (!patient) return;
      if (!fundId && patient.latest_fund) setFundId(patient.latest_fund);
      if (patient.latest_procedure_type) setProcedureTypeId(patient.latest_procedure_type);
      if (!procedureDate) setProcedureDate(new Date().toISOString().split("T")[0] ?? "");
      if (procedureAmount == null && patient.latest_procedure_amount != null)
        setProcedureAmount(patient.latest_procedure_amount / 1000);
    },
    [patients, fundId, procedureDate, procedureAmount, mode],
  );

  const reset = useCallback(() => {
    setPatientId("");
    setFundId("");
    setProcedureTypeId("");
    setProcedureDate("");
    setProcedureAmount(null);
    setPaymentMethod("NONE");
    setPaymentDate("");
    setFieldErrors({});
  }, []);

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};
    if (!patientId) errors.patientId = t("error.requiredField");
    if (!procedureTypeId) errors.procedureTypeId = t("error.requiredField");
    if (!procedureDate) errors.procedureDate = t("error.requiredField");
    return errors;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      logger.warn(`${TAG} Submit with missing required fields`);
      setFieldErrors(errors);
      toastService.show("error", t("error.requiredFields"));
      return;
    }

    setFieldErrors({});
    setLoading(true);
    try {
      if (mode === "create") {
        const result = await gateway.addProcedure(
          patientId,
          fundId || null,
          procedureTypeId,
          procedureDate,
          procedureAmount !== null ? Math.round(procedureAmount * 1000) : null,
        );
        logger.info(`${TAG} Procedure added`, { id: result.id });
        reset();
        toastService.show("success", t("state.added"));
        onSuccess?.();
        onClose();
      } else {
        if (!procedure) return;
        await gateway.updateProcedure({
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
        });
        toastService.show("success", t("state.updated"));
        onSuccess?.();
        onClose();
      }
    } catch (error) {
      logger.error(`${TAG} Error submitting`, { error });
      toastService.show("error", error instanceof Error ? error.message : tc("error.unknown"));
    } finally {
      setLoading(false);
    }
  };

  // Entity creation handlers (create mode)
  const handlePatientCreated = useCallback(
    async (data: { name: string; ssn?: string }) => {
      try {
        const patient: Patient = await gateway.createNewPatient(data.name, data.ssn ?? null);
        setPatientId(patient.id);
        setFieldErrors((prev) => ({ ...prev, patientId: undefined }));
        setPatientModal({ open: false, query: "" });
      } catch (error) {
        logger.error(`${TAG} Error creating patient`, { error });
        toastService.show("error", error instanceof Error ? error.message : tc("error.unknown"));
      }
    },
    [tc],
  );

  const handleFundCreated = useCallback(
    async (data: { fundIdentifier: string; name: string }) => {
      try {
        const fund: AffiliatedFund = await gateway.createNewFund(data.fundIdentifier, data.name);
        setFundId(fund.id);
        setFundModal({ open: false, query: "" });
      } catch (error) {
        logger.error(`${TAG} Error creating fund`, { error });
        toastService.show("error", error instanceof Error ? error.message : tc("error.unknown"));
      }
    },
    [tc],
  );

  const selectedPatient = patients.find((p) => p.id === patientId);
  const selectedFund = funds.find((f) => f.id === fundId);
  const sortedFunds = [...funds].sort((a, b) => a.fund_identifier.localeCompare(b.fund_identifier));

  return {
    // Reference data
    patients,
    funds,
    sortedFunds,
    procedureTypes,
    // Derived
    selectedPatient,
    selectedFund,
    // Form state
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
    // Creation modals
    patientModal,
    setPatientModal,
    fundModal,
    setFundModal,
    handlePatientCreated,
    handleFundCreated,
  };
}
