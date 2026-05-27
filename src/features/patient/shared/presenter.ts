import type { Fund, Patient, PatientError, ProcedureType } from "@/bindings";
import type { PatientFormData, PatientRow } from "./types";

/**
 * Layer 3 of the F27 typed-error pipeline: pure code → i18n key mapping.
 * Returns `{ key, params }`; the caller (Layer 4) calls `t(key, params)`
 * to translate. The presenter has no runtime dependency on i18next, so it
 * is trivially unit-testable.
 *
 * Exhaustive switch — every PatientError variant has an entry.
 */
export function formatPatientError(err: PatientError): {
  key: string;
  params?: Record<string, string | number>;
} {
  switch (err.code) {
    case "NameEmpty":
      return { key: "patient:errors.name_empty" };
    case "NonAnonymousRequiresName":
      return { key: "patient:errors.non_anonymous_requires_name" };
    case "InvalidSsn":
      return { key: "patient:errors.invalid_ssn" };
    case "DatabaseError":
      return { key: "patient:errors.database_error" };
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
