import type { Dispatch } from "react";
import type { ProcedureRow, WorkflowAction, WorkflowState } from "../../model";
import type { WorkflowEvent } from "../../model/workflow.types";
import { AmountEditor } from "../editor";
import { TABLE_STYLES } from "../ui.styles";
import { WorkflowCell } from "./WorkflowCell";

interface AmountCellProps {
  row: ProcedureRow;
  state: WorkflowState;
  actions: WorkflowAction;
  dispatch: Dispatch<WorkflowEvent>;
}

export function AmountCell({ row, state, actions, dispatch }: AmountCellProps) {
  return (
    <WorkflowCell
      rowId={row.rowId}
      step="AMOUNT_ENTRY"
      activeRowId={state.focusedRowId}
      activeStep={state.currentStep}
      className={TABLE_STYLES.cellBase}
      onActivate={actions.activate}
      editor={
        <AmountEditor
          amount={state.editingRow?.procedureAmount ?? 0}
          initialAmount={row.procedureAmount ?? 0}
          onChange={(val) =>
            dispatch({
              type: "EVENT_UPDATE_DRAFT",
              fields: { procedureAmount: val },
            })
          }
          onCommit={(finalAmount) => actions.enterAmount(finalAmount)}
          onCancel={() => dispatch({ type: "EVENT_CANCEL" })}
        />
      }
    >
      <div className="text-right font-mono">
        {typeof row.procedureAmount === "number" ? `${row.procedureAmount.toFixed(2)} €` : "—"}
      </div>
    </WorkflowCell>
  );
}
