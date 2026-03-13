import type { Procedure } from "@/bindings";
import type { ProcedureRow, ProcedureRowReferenceData } from "./procedure-row.types";

/**
 * Converts Procedure to ProcedureRow with populated reference data
 *
 * Looks up patient, fund, and procedure type by ID to populate display fields.
 *
 * @param procedure - The Procedure from backend
 * @param referenceData - Reference data (patients, funds, procedure types)
 * @returns ProcedureRow with all fields populated
 */
export const toProcedureRow = (
  procedure: Procedure,
  referenceData: ProcedureRowReferenceData,
): ProcedureRow => {
  // Look up patient data
  const patient = procedure.patient_id
    ? referenceData.patients.find((p) => p.id === procedure.patient_id)
    : null;

  // Look up fund data
  const fund = procedure.fund_id
    ? referenceData.funds.find((f) => f.id === procedure.fund_id)
    : null;

  // Look up procedure type data
  const procedureType = procedure.procedure_type_id
    ? referenceData.procedureTypes.find((pt) => pt.id === procedure.procedure_type_id)
    : null;

  return {
    rowId: crypto.randomUUID(),
    isDraft: false,
    draftPeriod: null, // Saved procedures are not drafts
    // Patient data (populated from reference)
    patientId: procedure.patient_id,
    patientName: patient?.name ?? null,
    ssn: patient?.ssn ?? null,
    // Fund data (populated from reference)
    fundId: procedure.fund_id,
    fundIdentifier: fund?.fund_identifier ?? null,
    fundName: fund?.name ?? null,
    // Procedure type data (populated from reference)
    procedureTypeId: procedure.procedure_type_id,
    procedureName: procedureType?.name ?? null,
    // Procedure data — amounts converted from thousandths (i64) to euros (number)
    procedureDate: procedure.procedure_date,
    procedureAmount: procedure.procedure_amount != null ? procedure.procedure_amount / 1000 : null,
    // Payment data (readonly from backend) — amounts converted from thousandths to euros
    paymentMethod: procedure.payment_method,
    confirmedPaymentDate: procedure.confirmed_payment_date,
    actualPaymentAmount:
      procedure.actual_payment_amount != null ? procedure.actual_payment_amount / 1000 : null,
    awaitedAmount: null, // Not available from backend Procedure type
    status: procedure.payment_status,
    id: procedure.id,
  };
};
