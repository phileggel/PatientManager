import type { Procedure, ProcedureType } from "@/bindings";

export function makeProcedureType(overrides?: Partial<ProcedureType>): ProcedureType {
  return {
    id: "procedure-type-1",
    name: "Consultation",
    default_amount: 25000,
    category: null,
    ...overrides,
  };
}

export function makeProcedure(overrides?: Partial<Procedure>): Procedure {
  return {
    id: "procedure-1",
    patient_id: "patient-1",
    fund_id: "fund-1",
    procedure_type_id: "procedure-type-1",
    procedure_date: "2026-01-15",
    billed_amount: 50000,
    payment_method: "NONE",
    payment_status: "CREATED",
    confirmed_payment_date: "", // backend uses "" (not null) to represent "no confirmed date"
    paid_amount: null,
    ...overrides,
  };
}
