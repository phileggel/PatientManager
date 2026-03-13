import type { Patient } from "@/bindings";

type PatientOverrides = Omit<Partial<Patient>, "name" | "ssn">;

export function makePatient(overrides?: PatientOverrides): Patient {
  return {
    id: "patient-1",
    name: "Marie Dupont",
    ssn: "1234567890123",
    is_anonymous: false,
    temp_id: null,
    latest_procedure_type: null,
    latest_fund: null,
    latest_date: "",
    latest_procedure_amount: null,
    ...overrides,
  };
}
