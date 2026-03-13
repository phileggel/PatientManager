/**
 * useAddProcedurePanel - Logic for the add procedure panel.
 *
 * Reads patients, funds, procedureTypes from the store.
 * Manages form state, validation, submission and entity creation modals.
 * When a patient is selected, auto-fills fund, procedure type, date and amount
 * from their latest procedure data (only if fields are currently empty).
 */

import { type FormEvent, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import type { AffiliatedFund, Patient } from "@/bindings";
import { toastService } from "@/core/snackbar";
import { useAppStore } from "@/lib/appStore";
import { logger } from "@/lib/logger";
import * as gateway from "../../api/gateway";

const TAG = "[useAddProcedurePanel]";

interface FieldErrors {
  patientId?: string;
  procedureTypeId?: string;
  procedureDate?: string;
}

export function useAddProcedurePanel(onSuccess?: () => void) {
  const { t } = useTranslation("procedure");
  const { t: tc } = useTranslation("common");

  const patients = useAppStore((state) => state.patients);
  const funds = useAppStore((state) => state.funds);
  const procedureTypes = useAppStore((state) => state.procedureTypes);

  // Form state
  const [patientId, setPatientId] = useState("");
  const [fundId, setFundId] = useState("");
  const [procedureTypeId, setProcedureTypeId] = useState("");
  const [procedureDate, setProcedureDate] = useState("");
  const [procedureAmount, setProcedureAmount] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("NONE");
  const [paymentDate, setPaymentDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Creation modal state
  const [patientModal, setPatientModal] = useState<{ open: boolean; query: string }>({
    open: false,
    query: "",
  });
  const [fundModal, setFundModal] = useState<{ open: boolean; query: string }>({
    open: false,
    query: "",
  });

  const handlePatientChange = useCallback(
    (id: string) => {
      setPatientId(id);
      if (!id) return;

      const patient = patients.find((p) => p.id === id);
      if (!patient) return;

      if (!fundId && patient.latest_fund) setFundId(patient.latest_fund);
      if (patient.latest_procedure_type) setProcedureTypeId(patient.latest_procedure_type);
      if (!procedureDate) setProcedureDate(new Date().toISOString().split("T")[0] ?? "");
      if (procedureAmount == null && patient.latest_procedure_amount != null)
        setProcedureAmount(patient.latest_procedure_amount / 1000);
    },
    [patients, fundId, procedureDate, procedureAmount],
  );

  const reset = () => {
    setPatientId("");
    setFundId("");
    setProcedureTypeId("");
    setProcedureDate("");
    setProcedureAmount(null);
    setPaymentMethod("NONE");
    setPaymentDate("");
    setFieldErrors({});
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const errors: FieldErrors = {};
    if (!patientId) errors.patientId = t("error.requiredField");
    if (!procedureTypeId) errors.procedureTypeId = t("error.requiredField");
    if (!procedureDate) errors.procedureDate = t("error.requiredField");

    if (Object.keys(errors).length > 0) {
      logger.warn(`${TAG} Submit with missing required fields`);
      setFieldErrors(errors);
      toastService.show("error", t("error.requiredFields"));
      return;
    }

    setFieldErrors({});
    logger.debug(`${TAG} Submitting`, { patientId, procedureTypeId, procedureDate });
    setLoading(true);

    try {
      const result = await gateway.addProcedure(
        patientId,
        fundId || null,
        procedureTypeId,
        procedureDate,
        procedureAmount !== null ? Math.round(procedureAmount * 1000) : null,
      );

      logger.info(`${TAG} Procedure added successfully`, { id: result.id });
      reset();
      toastService.show("success", t("state.added"));
      onSuccess?.();
    } catch (error) {
      logger.error(`${TAG} Error adding procedure`, { error });
      toastService.show("error", error instanceof Error ? error.message : tc("error.unknown"));
    } finally {
      setLoading(false);
    }
  };

  // Entity creation handlers — auto-select the created entity
  const handlePatientCreated = async (data: { name: string; ssn?: string }) => {
    const patient: Patient = await gateway.createNewPatient(data.name, data.ssn ?? null);
    setPatientId(patient.id);
    setFieldErrors((prev) => ({ ...prev, patientId: undefined }));
    setPatientModal({ open: false, query: "" });
  };

  const handleFundCreated = async (data: { fundIdentifier: string; name: string }) => {
    const fund: AffiliatedFund = await gateway.createNewFund(data.fundIdentifier, data.name);
    setFundId(fund.id);
    setFundModal({ open: false, query: "" });
  };

  return {
    // Reference data
    patients,
    funds,
    procedureTypes,
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
    // Modal state + handlers
    patientModal,
    setPatientModal,
    fundModal,
    setFundModal,
    handlePatientCreated,
    handleFundCreated,
  };
}
