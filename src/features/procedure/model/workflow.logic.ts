import type { ProcedureRow } from "./procedure-row.types";
import { STEP_FIELD_MAP, WORKFLOW_SEQUENCE } from "./workflow.constants";
import type { WorkflowState, WorkflowStep } from "./workflow.types";

/** getNextStep output signal indicating that the user input workflow is finished */
export const WORKFLOW_EXIT = "WORKFLOW_FINISHED" as const;

export const getNextStep = (currentStep: WorkflowStep): WorkflowStep | typeof WORKFLOW_EXIT => {
  const currentIndex = WORKFLOW_SEQUENCE.indexOf(currentStep);
  if (currentIndex === -1) {
    return WORKFLOW_EXIT;
  }

  const nextStep = WORKFLOW_SEQUENCE[currentIndex + 1];
  return nextStep ?? WORKFLOW_EXIT;
};

export const isCellActive = (
  state: WorkflowState,
  rowId: string,
  field: keyof ProcedureRow,
): boolean => {
  if (state.focusedRowId !== rowId) {
    return false;
  }

  return STEP_FIELD_MAP[state.currentStep] === field;
};
