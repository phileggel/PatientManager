import type { Dispatch } from "react";
import type { AffiliatedFund } from "@/bindings";
import type { ProcedureFormModals } from "../../hooks/useProcedureFormModals";
import type { ProcedureRow, WorkflowAction, WorkflowState } from "../../model";
import type { WorkflowEvent } from "../../model/workflow.types";
import { FundAutocompleteEditor } from "../editor";
import { TABLE_STYLES } from "../ui.styles";
import { WorkflowCell } from "./WorkflowCell";

interface FundCellProps {
  row: ProcedureRow;
  state: WorkflowState;
  actions: WorkflowAction;
  dispatch: Dispatch<WorkflowEvent>;
  modals: ProcedureFormModals;
  allFunds: AffiliatedFund[];
}

export function FundCell({ row, state, actions, dispatch, modals, allFunds }: FundCellProps) {
  return (
    <WorkflowCell
      rowId={row.rowId}
      step="FUND_SELECTION"
      activeRowId={state.focusedRowId}
      activeStep={state.currentStep}
      className={TABLE_STYLES.cellBase}
      onActivate={actions.activate}
      editor={
        <FundAutocompleteEditor
          allData={allFunds}
          query={state.editingRow?.fundIdentifier || ""}
          initialQuery={row.fundIdentifier || ""}
          onQueryChange={(val) =>
            dispatch({ type: "EVENT_UPDATE_DRAFT", fields: { fundIdentifier: val } })
          }
          onSelect={actions.selectFund}
          onCommit={() => {
            if (!state.editingRow?.fundId) {
              dispatch({ type: "EVENT_CANCEL" });
            }
          }}
          onCancel={() => dispatch({ type: "EVENT_CANCEL" })}
          onCreateNew={(q) => modals.openModal("FUND", q)}
        />
      }
    >
      {row.fundIdentifier || "—"}
    </WorkflowCell>
  );
}
