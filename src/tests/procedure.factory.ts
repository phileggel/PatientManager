import type { Procedure, ProcedureType } from "@/bindings";
import type { ProcedureRow } from "@/features/procedure/model/procedure-row.types";

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
    fund_reconciliation_date: "", // backend uses "" (not null) for "no Stage 1 date yet"
    confirmed_payment_date: "", // backend uses "" (not null) to represent "no confirmed date"
    paid_amount: null,
    ...overrides,
  };
}

export function makeProcedureRow(overrides?: Partial<ProcedureRow>): ProcedureRow {
  return {
    rowId: "procedure-1",
    isDraft: false,
    draftPeriod: null,
    patientId: "patient-1",
    patientName: "Alice",
    ssn: null,
    fundId: "fund-1",
    fundIdentifier: "440",
    fundName: "CPAM",
    procedureTypeId: "procedure-type-1",
    procedureName: "Consultation",
    procedureDate: "2026-01-15",
    billedAmount: 50,
    paymentMethod: "NONE",
    fundReconciliationDate: null,
    confirmedPaymentDate: null,
    paidAmount: null,
    awaitedAmount: 50,
    status: "CREATED",
    isOverdue: false,
    id: "procedure-1",
    ...overrides,
  };
}
