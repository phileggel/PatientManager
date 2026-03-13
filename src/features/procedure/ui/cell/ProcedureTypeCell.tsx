import type { Dispatch } from "react";
import type { ProcedureType } from "@/bindings";
import type { ProcedureFormModals } from "../../hooks/useProcedureFormModals";
import type { ProcedureRow, WorkflowAction, WorkflowState } from "../../model";
import type { WorkflowEvent } from "../../model/workflow.types";
import { WorkflowCell } from "../cell/WorkflowCell";
import { ProcedureTypeAutocompleteEditor } from "../editor";
import { TABLE_STYLES } from "../ui.styles";

interface ProcedureTypeCellProps {
  row: ProcedureRow;
  state: WorkflowState;
  actions: WorkflowAction;
  dispatch: Dispatch<WorkflowEvent>;
  modals: ProcedureFormModals;
  allProcedureTypes: ProcedureType[];
}

export function ProcedureTypeCell({
  row,
  state,
  actions: action,
  dispatch,
  modals,
  allProcedureTypes,
}: ProcedureTypeCellProps) {
  return (
    <WorkflowCell
      rowId={row.rowId}
      step="PROCEDURE_SELECTION"
      activeRowId={state.focusedRowId}
      activeStep={state.currentStep}
      className={TABLE_STYLES.cellBase}
      onActivate={action.activate}
      editor={
        <ProcedureTypeAutocompleteEditor
          allData={allProcedureTypes}
          query={state.editingRow?.procedureName || ""}
          initialQuery={row.procedureName || ""}
          onQueryChange={(val) =>
            dispatch({ type: "EVENT_UPDATE_DRAFT", fields: { procedureName: val } })
          }
          onSelect={action.selectProcedureType}
          onCommit={() => {
            if (!state.editingRow?.procedureTypeId) {
              dispatch({ type: "EVENT_CANCEL" });
            }
          }}
          onCancel={() => dispatch({ type: "EVENT_CANCEL" })}
          onCreateNew={(q) => modals.openModal("PROCEDURE_TYPE", q)}
        />
      }
    >
      {row.procedureName || "—"}
    </WorkflowCell>
  );
}
