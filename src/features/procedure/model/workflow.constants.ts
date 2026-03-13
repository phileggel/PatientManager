import type { ProcedureRow } from "./procedure-row.types";
import type { WorkflowState, WorkflowStep } from "./workflow.types";

export const STEP_FIELD_MAP: Record<WorkflowStep, keyof ProcedureRow | null> = {
  IDLE: null,
  PATIENT_SELECTION: "patientName",
  FUND_SELECTION: "fundIdentifier",
  PROCEDURE_SELECTION: "procedureName",
  DATE_ENTRY: "procedureDate",
  AMOUNT_ENTRY: "procedureAmount",
  SAVING: null,
};

// input workflow sequence
// indicates the workflow step where the user can update a cell value
export const WORKFLOW_SEQUENCE: WorkflowStep[] = [
  "PATIENT_SELECTION",
  "FUND_SELECTION",
  "PROCEDURE_SELECTION",
  "DATE_ENTRY",
  "AMOUNT_ENTRY",
];

export const INITIAL_WORKFLOW_STATE: WorkflowState = {
  focusedRowId: null,
  currentStep: "IDLE",
  editingRow: null,
};
