import type { Dispatch } from "react";
import type { Patient } from "@/bindings";
import type { ProcedureFormModals } from "../../hooks/useProcedureFormModals";
import type { ProcedureRow, WorkflowAction, WorkflowState } from "../../model";
import type { WorkflowEvent } from "../../model/workflow.types";
import { PatientAutocompleteEditor } from "../editor";
import { TABLE_STYLES } from "../ui.styles";
import { WorkflowCell } from "./WorkflowCell";

interface PatientCellProps {
  row: ProcedureRow;
  state: WorkflowState;
  actions: WorkflowAction;
  allPatients: Patient[];
  modals: ProcedureFormModals;
  dispatch: Dispatch<WorkflowEvent>;
}

export const PatientCell = ({
  row,
  state,
  actions,
  allPatients,
  modals,
  dispatch,
}: PatientCellProps) => (
  <WorkflowCell
    rowId={row.rowId}
    step="PATIENT_SELECTION"
    activeRowId={state.focusedRowId}
    activeStep={state.currentStep}
    className={TABLE_STYLES.cellBase}
    onActivate={actions.activate}
    editor={
      <PatientAutocompleteEditor
        allData={allPatients}
        query={state.editingRow?.patientName || ""}
        initialQuery={row.patientName || ""}
        onQueryChange={(val) =>
          dispatch({ type: "EVENT_UPDATE_DRAFT", fields: { patientName: val } })
        }
        onSelect={actions.selectPatient}
        onCommit={() => !state.editingRow?.patientId && dispatch({ type: "EVENT_CANCEL" })}
        onCancel={() => dispatch({ type: "EVENT_CANCEL" })}
        onCreateNew={(q) => modals.openModal("PATIENT", q)}
      />
    }
  >
    {row.patientName || "—"}
  </WorkflowCell>
);
