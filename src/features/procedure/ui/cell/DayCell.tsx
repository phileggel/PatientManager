import type { Dispatch } from "react";
import {
  formatDateDisplay,
  formatDayToIso,
  getDayFromIso,
  type ProcedureRow,
  type WorkflowAction,
  type WorkflowState,
} from "../../model";
import type { WorkflowEvent } from "../../model/workflow.types";
import { DayEditor } from "../editor";
import { TABLE_STYLES } from "../ui.styles";
import { WorkflowCell } from "./WorkflowCell";

interface DateCellProps {
  row: ProcedureRow;
  state: WorkflowState;
  actions: WorkflowAction;
  dispatch: Dispatch<WorkflowEvent>;
  tableContext: { maxDays: number; isoPrefix: string };
}

export function DateCell({ row, state, actions, dispatch, tableContext }: DateCellProps) {
  return (
    <WorkflowCell
      rowId={row.rowId}
      step="DATE_ENTRY"
      activeRowId={state.focusedRowId}
      activeStep={state.currentStep}
      className={TABLE_STYLES.cellBase}
      onActivate={actions.activate}
      editor={
        <DayEditor
          day={getDayFromIso(state.editingRow?.procedureDate)}
          initialDay={getDayFromIso(row.procedureDate)}
          maxDays={tableContext.maxDays}
          onChange={(newDay) => {
            const newDate = formatDayToIso(newDay, tableContext.isoPrefix);
            dispatch({
              type: "EVENT_UPDATE_DRAFT",
              fields: { procedureDate: newDate },
            });
          }}
          onCommit={(finalDay) => {
            const finalDate = formatDayToIso(finalDay, tableContext.isoPrefix);
            actions.enterDate(finalDate);
          }}
          onCancel={() => dispatch({ type: "EVENT_CANCEL" })}
        />
      }
    >
      {formatDateDisplay(row.procedureDate)}
    </WorkflowCell>
  );
}
