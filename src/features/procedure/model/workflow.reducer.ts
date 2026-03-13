import { logger } from "@/lib/logger";
import type { ProcedureRow } from "./procedure-row.types";
import { getNextStep, WORKFLOW_EXIT } from "./workflow.logic";
import type { WorkflowEvent, WorkflowState, WorkflowStep } from "./workflow.types";

export function reduceWorkflowState(state: WorkflowState, event: WorkflowEvent): WorkflowState {
  logger.debug(`event.type:${event.type}`);

  switch (event.type) {
    // starting the row workflow
    case "EVENT_FOCUS_CELL": {
      // CAS 1 : Même cellule, même ligne -> No-op (on ne touche à rien)
      if (state.focusedRowId === event.rowId && state.currentStep === event.clickedStep) {
        return state;
      }

      // CAS 2 : Même ligne, mais changement de cellule (Jump)
      // IMPORTANT : On ne touche pas à editingRow ici pour ne pas perdre les saisies en cours !
      if (state.focusedRowId === event.rowId) {
        return {
          ...state,
          currentStep: event.clickedStep,
        };
      }

      // CAS 3 : Changement de ligne (New Focus)
      const targetRow = event.initialRows.find((r) => r.rowId === event.rowId);

      // Si la ligne n'est plus là (ex: supprimée entre temps), on ignore l'event
      if (!targetRow) return state;

      return {
        ...state,
        focusedRowId: event.rowId,
        currentStep: event.clickedStep,
        editingRow: {
          ...targetRow,
          procedureDate:
            targetRow.isDraft && !targetRow.procedureDate
              ? (event.latestDateHint ?? null)
              : (targetRow.procedureDate ?? null),
        },
      };
    }

    // silently save
    case "EVENT_COMMIT_SUCCESS":
      return {
        ...state,
        focusedRowId: null,
        currentStep: "IDLE",
        editingRow: null,
      };

    case "EVENT_UPDATE_DRAFT":
      return {
        ...state,
        editingRow: state.editingRow ? { ...state.editingRow, ...event.fields } : null,
      };

    case "EVENT_SELECT_PATIENT": {
      if (!state.editingRow) return state;
      const updatedRow = {
        ...state.editingRow,
        patientId: event.patient.id,
        patientName: event.patient.name,
        ssn: event.patient.ssn,
      };

      // Auto-fill from patient tracking fields (only on draft rows and if empty)
      if (state.editingRow.isDraft) {
        if (event.trackedFund && !updatedRow.fundId) {
          updatedRow.fundId = event.trackedFund.id;
          updatedRow.fundIdentifier = event.trackedFund.fund_identifier;
          updatedRow.fundName = event.trackedFund.name;
        }
        if (event.trackedProcedureType && !updatedRow.procedureTypeId) {
          updatedRow.procedureTypeId = event.trackedProcedureType.id;
          updatedRow.procedureName = event.trackedProcedureType.name;
        }
        // Fill amount if empty (0 or null)
        if (event.trackedAmount !== undefined && !updatedRow.procedureAmount) {
          updatedRow.procedureAmount = event.trackedAmount;
        }
      }

      return {
        ...state,
        currentStep: nextTargetStep({ ...state, editingRow: updatedRow }),
        editingRow: updatedRow,
      };
    }

    case "EVENT_SELECT_FUND": {
      if (!state.editingRow) return state;
      const updatedRow = {
        ...state.editingRow,
        fundId: event.fund.id,
        fundIdentifier: event.fund.fund_identifier,
        fundName: event.fund.name,
      };

      return {
        ...state,
        currentStep: nextTargetStep({ ...state, editingRow: updatedRow }),
        editingRow: updatedRow,
      };
    }

    case "EVENT_SELECT_PROCEDURE_TYPE": {
      if (!state.editingRow) return state;
      const updatedRow = {
        ...state.editingRow,
        procedureTypeId: event.procedureType.id,
        procedureName: event.procedureType.name,
        // Keep existing amount or use default from procedure type (converted from thousandths to euros)
        procedureAmount:
          state.editingRow.procedureAmount ||
          (event.procedureType.default_amount != null
            ? event.procedureType.default_amount / 1000
            : null),
      };

      return {
        ...state,
        currentStep: nextTargetStep({ ...state, editingRow: updatedRow }),
        editingRow: updatedRow,
      };
    }

    case "EVENT_ENTER_DATE": {
      if (!state.editingRow) return state;
      const updatedRow = {
        ...state.editingRow,
        procedureDate: event.date,
      };

      return {
        ...state,
        currentStep: nextTargetStep({ ...state, editingRow: updatedRow }),
        editingRow: updatedRow,
      };
    }

    case "EVENT_ENTER_AMOUNT": {
      if (!state.editingRow) return state;
      const updatedRow = {
        ...state.editingRow,
        procedureAmount: event.amount,
      };

      return {
        ...state,
        currentStep: nextTargetStep({ ...state, editingRow: updatedRow }),
        editingRow: updatedRow,
      };
    }

    case "EVENT_CANCEL":
      return {
        ...state,
        currentStep: "IDLE",
        editingRow: null,
        focusedRowId: null,
      };

    default:
      return state;
  }
}

const nextTargetStep = (state: WorkflowState): WorkflowStep => {
  if (!state.editingRow) return "IDLE";

  // Pour une ligne existante, on autorise la sauvegarde immédiate
  if (state.editingRow && !state.editingRow.isDraft) {
    return "SAVING";
  }

  // Pour un draft, on vérifie la fin du tunnel ET la validité
  const next = getNextStep(state.currentStep);
  if (next === WORKFLOW_EXIT) {
    return isRowReadyToSave(state.editingRow) ? "SAVING" : state.currentStep;
  }

  return next as WorkflowStep;
};

const isRowReadyToSave = (row: ProcedureRow): boolean => {
  return !!(
    row.patientId &&
    row.fundId &&
    row.procedureTypeId &&
    row.procedureDate &&
    row.procedureAmount !== undefined &&
    row.procedureAmount !== null
  );
};
