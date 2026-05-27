import type { ProcedureError, ProcedureType } from "@/bindings";
import i18n from "@/i18n/config";
import type { ProcedureTypeFormData, ProcedureTypeRow } from "./types";

/**
 * Maps a typed ProcedureError variant to a translated, user-facing message.
 *
 * Layer 3 of the F27 typed-error pipeline: pure code → i18n key mapping.
 * The gateway converts wire-typed errors here so callers (hooks, components)
 * see a single localized string in `ServiceResult.error` regardless of locale.
 *
 * Exhaustive switch — every ProcedureError variant has an entry. Variants
 * unreachable from the procedure-type wire surface (Procedure aggregate
 * invariants, ProcedureRefund variants) still map to keys so future use-case
 * composites that surface them through this presenter remain typed.
 */
export function formatProcedureError(err: ProcedureError): string {
  switch (err.code) {
    case "PatientIdEmpty":
      return i18n.t("procedure-type:errors.patientIdEmpty");
    case "ProcedureTypeIdEmpty":
      return i18n.t("procedure-type:errors.procedureTypeIdEmpty");
    case "ProcedureTypeNameEmpty":
      return i18n.t("procedure-type:errors.nameEmpty");
    case "DefaultAmountNegative":
      return i18n.t("procedure-type:errors.defaultAmountNegative");
    case "ProcedureTypeNotFound":
      return i18n.t("procedure-type:errors.notFound", {
        id: err.procedure_type_id,
      });
    case "ProcedureTypeNameDuplicate":
      return i18n.t("procedure-type:errors.nameDuplicate");
    case "ReservedTypeNotMutable":
      return i18n.t("procedure-type:errors.reservedNotMutable");
    case "RefundReasonTooLong":
      return i18n.t("procedure-type:errors.refundReasonTooLong");
    case "InvalidRefundDateFormat":
      return i18n.t("procedure-type:errors.invalidRefundDateFormat");
    case "DatabaseError":
      return i18n.t("procedure-type:errors.databaseError");
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
