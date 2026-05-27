import type { ProcedureError, ProcedureType } from "@/bindings";
import type { ProcedureTypeFormData, ProcedureTypeRow } from "./types";

/**
 * Layer 3 of the F27 typed-error pipeline: pure code → i18n key mapping.
 * Returns `{ key, params }`; the caller (Layer 4) calls `t(key, params)`
 * to translate. The presenter has no runtime dependency on i18next, so it
 * is trivially unit-testable.
 *
 * Exhaustive switch — every ProcedureError variant has an entry. Variants
 * unreachable from the procedure-type wire surface (Procedure aggregate
 * invariants, ProcedureRefund variants) still map to keys so future use-case
 * composites that surface them through this presenter remain typed.
 */
export function formatProcedureError(err: ProcedureError): {
  key: string;
  params?: Record<string, string | number>;
} {
  switch (err.code) {
    case "PatientIdEmpty":
      return { key: "procedure-type:errors.patient_id_empty" };
    case "ProcedureTypeIdEmpty":
      return { key: "procedure-type:errors.procedure_type_id_empty" };
    case "ProcedureTypeNameEmpty":
      return { key: "procedure-type:errors.name_empty" };
    case "DefaultAmountNegative":
      return { key: "procedure-type:errors.default_amount_negative" };
    case "ProcedureTypeNotFound":
      return {
        key: "procedure-type:errors.not_found",
        params: { id: err.procedure_type_id },
      };
    case "ProcedureTypeNameDuplicate":
      return { key: "procedure-type:errors.name_duplicate" };
    case "ReservedTypeNotMutable":
      return { key: "procedure-type:errors.reserved_not_mutable" };
    case "RefundReasonTooLong":
      return { key: "procedure-type:errors.refund_reason_too_long" };
    case "InvalidRefundDateFormat":
      return { key: "procedure-type:errors.invalid_refund_date_format" };
    case "DatabaseError":
      return { key: "procedure-type:errors.database_error" };
  }
}

/**
 * ProcedureTypePresenter - UI Projection of ProcedureType Domain Object
 *
 * Transforms the ProcedureType domain model into different UI representations:
 * - toRow: For table display (with sorting/filtering)
 * - toFormData: For form editing (only editable fields)
 *
 * This centralizes field extraction logic and makes transformations reusable
 * across different parts of the application.
 */
export const ProcedureTypePresenter = {
  /**
   * Transform domain ProcedureType to UI row data for table display
   * Extracts display fields and adds UI-specific properties
   */
  toRow(procedureType: ProcedureType): ProcedureTypeRow {
    return {
      rowId: crypto.randomUUID(),
      id: procedureType.id,
      name: procedureType.name,
      // Kept in thousandths; consumers format via useFormatters().formatCurrency.
      defaultAmount: procedureType.default_amount ?? 0,
      category: procedureType.category ?? null,
    };
  },

  /**
   * Transform domain ProcedureType to form data for editing
   * Extracts only the fields that users can edit
   * Used for both initial form setup and resetting the form
   */
  toFormData(procedureType: ProcedureType): ProcedureTypeFormData {
    return {
      name: procedureType.name || "",
      defaultAmount: ((procedureType.default_amount ?? 0) / 1000).toString(),
      category: procedureType.category || "",
    };
  },
};
