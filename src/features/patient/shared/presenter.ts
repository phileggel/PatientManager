import type { Fund, Patient, PatientError, ProcedureType } from "@/bindings";
import i18n from "@/i18n/config";
import type { PatientFormData, PatientRow } from "./types";

/**
 * Maps a typed PatientError variant to a translated, user-facing message.
 *
 * Layer 3 of the F27 typed-error pipeline: pure code → i18n key mapping.
 * The gateway converts wire-typed errors here so callers (hooks, components)
 * see a single localized string in `ServiceResult.error` regardless of locale.
 *
 * Exhaustive switch — every PatientError variant has an entry.
 */
export function formatPatientError(err: PatientError): string {
  switch (err.code) {
    case "NameEmpty":
      return i18n.t("patient:errors.nameEmpty");
    case "NonAnonymousRequiresName":
      return i18n.t("patient:errors.nonAnonymousRequiresName");
    case "InvalidSsn":
      return i18n.t("patient:errors.invalidSsn");
    case "DatabaseError":
      return i18n.t("patient:errors.databaseError");
  }
}

/**
 * PatientPresenter - UI Projection of Patient Domain Object
 *
 * Transforms the Patient domain model into different UI representations:
 * - toRow: For table display (with sorting/filtering)
 * - toFormData: For form editing (only editable fields)
 *
 * This centralizes field extraction logic and makes transformations reusable
 * across different parts of the application.
 */
export const PatientPresenter = {
  /**
   * Transform domain Patient to UI row data for table display
   * Extracts display fields and adds UI-specific properties
   */
  toRow(patient: Patient, funds?: Fund[]): PatientRow {
    let latestFund: string | null = patient.latest_fund ?? null;
    if (latestFund && funds) {
      const fund = funds.find((f) => f.id === latestFund);
      if (fund) {
        latestFund = `${fund.fund_identifier} (${fund.name})`;
      }
    }
    return {
      rowId: crypto.randomUUID(),
      id: patient.id,
      name: patient.name ?? null,
      ssn: patient.ssn ?? null,
      latestFund,
      latestDate: patient.latest_date ?? null,
      isAnonymous: patient.is_anonymous,
    };
  },

  resolveLatestProcedureTypeName(patient: Patient, procedureTypes: ProcedureType[]): string | null {
    if (!patient.latest_procedure_type) return null;
    return procedureTypes.find((pt) => pt.id === patient.latest_procedure_type)?.name ?? null;
  },

  /**
   * Transform domain Patient to form data for editing
   * Extracts only the fields that users can edit
   * Used for both initial form setup and resetting the form
   */
  toFormData(patient: Patient): PatientFormData {
    return {
      name: patient.name || "",
      ssn: patient.ssn || "",
    };
  },
};
