import type { AffiliatedFund, Patient } from "@/bindings";
import type { PatientFormData, PatientRow } from "./types";

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
  toRow(patient: Patient, funds?: AffiliatedFund[]): PatientRow {
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
