import type { PatientError, ProcedureInvalidReason, ProcedureOrchestrationError } from "@/bindings";
import { isPaidStatus, type ProcedureRow } from "../model/procedure-row.types";

/** The procedure form's fields a refusal can name (PRO-120, PRO-125). */
export type ProcedureFormField = "patientId" | "procedureTypeId" | "procedureDate";

const FIELD_ERROR_KEYS: Record<ProcedureInvalidReason, [ProcedureFormField, string]> = {
  PatientIdEmpty: ["patientId", "procedure:form_errors.patient_missing"],
  ProcedureTypeIdEmpty: ["procedureTypeId", "procedure:form_errors.procedure_type_missing"],
  ProcedureDateEmpty: ["procedureDate", "procedure:form_errors.procedure_date_missing"],
  ProcedureDateInvalid: ["procedureDate", "procedure:form_errors.procedure_date_invalid"],
};

/**
 * The i18n key to show under each field the backend refused (PRO-120), or
 * null when the error is not about the form's fields (it then goes to a toast).
 */
export function procedureFieldErrorKeys(
  err: ProcedureOrchestrationError,
): Partial<Record<ProcedureFormField, string>> | null {
  if (err.code !== "ProcedureInvalid") return null;
  return Object.fromEntries(err.reasons.map((reason) => FIELD_ERROR_KEYS[reason]));
}

/** The i18n key to show under the new-patient form's name, or null (TODO-026). */
export function patientNameErrorKey(err: PatientError): string | null {
  return err.code === "NameEmpty" ? "procedure:form_errors.patient_name_missing" : null;
}

/**
 * Layer 3 of the F27 typed-error pipeline for the procedure-orchestration use
 * case. Pure `code → { key, params }` mapping over the untagged composite
 * (`ProcedureError | ProcedureOrchestrationTask`); the caller (Layer 4) calls
 * `t(key, params)`. No runtime dependency on i18next.
 *
 * Exhaustive over the whole union — variants the 8 orchestration commands
 * cannot currently raise (ProcedureType / Refund invariants) still map to keys
 * so the switch stays total and future surfaces remain typed.
 */
export function formatProcedureOrchestrationError(err: ProcedureOrchestrationError): {
  key: string;
  params?: Record<string, string | number>;
} {
  switch (err.code) {
    // --- ProcedureOrchestrationTask (use-case guards) ---
    case "PatientNotFound":
      return { key: "procedure:errors.patient_not_found", params: { id: err.patient_id } };
    case "FundNotFound":
      return { key: "procedure:errors.fund_not_found", params: { id: err.fund_id } };
    case "ProcedureDeleteBlocked":
      return { key: "procedure:errors.delete_blocked" };
    // --- ProcedureError (BC) ---
    case "ProcedureInvalid":
      return { key: "procedure:error.invalid_fields" };
    case "ProcedureNotFound":
      return { key: "procedure:errors.procedure_not_found", params: { id: err.procedure_id } };
    case "ProcedureTypeNameEmpty":
      return { key: "procedure:errors.procedure_type_name_empty" };
    case "DefaultAmountNegative":
      return { key: "procedure:errors.default_amount_negative" };
    case "ProcedureTypeNotFound":
      return {
        key: "procedure:errors.procedure_type_not_found",
        params: { id: err.procedure_type_id },
      };
    case "ProcedureTypeNameDuplicate":
      return { key: "procedure:errors.procedure_type_name_duplicate" };
    case "ReservedTypeNotMutable":
      return { key: "procedure:errors.reserved_type_not_mutable" };
    case "RefundReasonTooLong":
      return { key: "procedure:errors.refund_reason_too_long" };
    case "InvalidRefundDateFormat":
      return { key: "procedure:errors.invalid_refund_date_format" };
    // --- shared infra ---
    case "DatabaseError":
      return { key: "procedure:errors.database_error" };
  }
}

/** All amount fields are in thousandths, matching the `formatCurrency` input contract. */
export interface SummaryStatsViewModel {
  uniquePatients: number;
  procedureCount: number;
  totalAmountThousandths: number;
  totalReceivedThousandths: number;
  totalAwaitedThousandths: number;
}

export function summarizeProcedureRows(rows: ProcedureRow[]): SummaryStatsViewModel {
  const nonDraft = rows.filter((r) => !r.isDraft);

  const uniquePatients = new Set(nonDraft.filter((r) => r.patientId).map((r) => r.patientId)).size;

  const procedureCount = nonDraft.length;

  const totalAmount = nonDraft.reduce((sum, r) => sum + r.billedAmount, 0);

  // Falls back to billedAmount for paid-status procedures whose paid_amount is null.
  const totalReceived = nonDraft.reduce((sum, r) => {
    if (r.paidAmount != null) return sum + r.paidAmount;
    if (isPaidStatus(r.status)) return sum + r.billedAmount;
    return sum;
  }, 0);

  // Outstanding balance = billed − received, floored at 0.
  // Uses the same paid-status fallback so reconciled procedures don't appear as still awaited.
  const totalAwaited = nonDraft.reduce((sum, r) => {
    const received = r.paidAmount ?? (isPaidStatus(r.status) ? r.billedAmount : null);
    const diff = r.billedAmount - (received ?? 0);
    return sum + (diff > 0 ? diff : 0);
  }, 0);

  return {
    uniquePatients,
    procedureCount,
    totalAmountThousandths: Math.round(totalAmount * 1000),
    totalReceivedThousandths: Math.round(totalReceived * 1000),
    totalAwaitedThousandths: Math.round(totalAwaited * 1000),
  };
}
