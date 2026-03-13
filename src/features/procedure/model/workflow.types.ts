import type { AffiliatedFund, Patient, ProcedureType } from "@/bindings";
import type { ProcedureRow } from "./procedure-row.types";

export type WorkflowStep =
  | "IDLE"
  | "PATIENT_SELECTION"
  | "FUND_SELECTION"
  | "PROCEDURE_SELECTION"
  | "DATE_ENTRY"
  | "AMOUNT_ENTRY"
  | "SAVING";

export type WorkflowEvent =
  | {
      type: "EVENT_FOCUS_CELL";
      rowId: string;
      clickedStep: WorkflowStep;
      initialRows: ProcedureRow[];
      latestDateHint?: string;
    }
  | {
      type: "EVENT_SELECT_PATIENT";
      patient: Patient;
      trackedFund?: AffiliatedFund;
      trackedProcedureType?: ProcedureType;
      trackedAmount?: number;
    }
  | { type: "EVENT_SELECT_FUND"; fund: AffiliatedFund }
  | { type: "EVENT_SELECT_PROCEDURE_TYPE"; procedureType: ProcedureType }
  | { type: "EVENT_ENTER_DATE"; date: string }
  | { type: "EVENT_ENTER_AMOUNT"; amount: number }
  | { type: "EVENT_CANCEL" }
  | { type: "EVENT_COMMIT_SUCCESS" }
  | { type: "EVENT_UPDATE_DRAFT"; fields: Partial<ProcedureRow> };

export interface WorkflowState {
  // The ID of the currently focused row
  focusedRowId: string | null;

  // The current workflow step for the focused row
  // indicates which editable column is being edited
  currentStep: WorkflowStep;

  // The current ProcedureRow being edited in the workflow
  editingRow: ProcedureRow | null;
}

export type WorkflowAction = {
  activate: (rowId: string, step: WorkflowStep) => void;
  selectPatient: (p: Patient) => void;
  selectFund: (f: AffiliatedFund) => void;
  selectProcedureType: (p: ProcedureType) => void;
  enterDate: (d: string) => void;
  enterAmount: (n: number) => void;
};
