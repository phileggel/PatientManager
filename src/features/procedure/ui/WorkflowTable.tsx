import { type Dispatch, useEffect, useMemo, useReducer } from "react";
import { useTranslation } from "react-i18next";
import type { AffiliatedFund, Patient, ProcedureType } from "@/bindings";
import { logger } from "@/lib/logger";
import { useProcedureFormModals } from "../hooks/useProcedureFormModals";
import {
  type ProcedureRow,
  reduceWorkflowState,
  type WorkflowAction,
  type WorkflowState,
  type WorkflowStep,
} from "../model";
import type { WorkflowEvent } from "../model/workflow.types";
import type {
  CreateFundFormData,
  CreatePatientFormData,
  CreateProcedureTypeFormData,
} from "./form";
import { CreateFormHub } from "./form/CreationHub";
import { COL_WIDTHS, TABLE_STYLES } from "./ui.styles";
import { type WorkflowBundle, WorkflowRow } from "./WorkflowRow";

const TAG = "[WorkFlowTable]";

// --- HOOK 1 : Gère la vie de la table (Ligne vide, Focus auto) ---
function useTableLifeCycle(
  state: WorkflowState,
  dispatch: Dispatch<WorkflowEvent>,
  rows: ProcedureRow[],
  onAddBlankRow: () => void,
  latestDate: string,
) {
  useEffect(() => {
    // add a blank row if initial table is empty
    if (rows.length === 0) {
      onAddBlankRow();
      return;
    }

    // add a blank row if the last row has already been registered
    const lastRow = rows[rows.length - 1];
    if (!lastRow?.isDraft) {
      onAddBlankRow();
      return;
    }

    // handle focus on a blank row
    if (state.currentStep === "IDLE" && !state.focusedRowId && lastRow.isDraft) {
      dispatch({
        type: "EVENT_FOCUS_CELL",
        rowId: lastRow.rowId,
        clickedStep: "PATIENT_SELECTION",
        initialRows: rows,
        latestDateHint: latestDate,
      });
    }
  }, [rows, onAddBlankRow, state.currentStep, state.focusedRowId, latestDate, dispatch]);
}

// --- HOOK 2 : Gère la persistance (API) ---
function useTablePersistance(
  state: WorkflowState,
  dispatch: Dispatch<WorkflowEvent>,
  {
    persistNewRow,
    persistUpdateRow,
    onRowUiSync,
  }: Pick<WorkflowTableProps, "persistNewRow" | "persistUpdateRow" | "onRowUiSync">,
) {
  useEffect(() => {
    if (state.currentStep !== "SAVING" || !state.editingRow) return;

    const rowToSave = state.editingRow;
    const performSave = async () => {
      try {
        const persistFn = rowToSave.isDraft ? persistNewRow : persistUpdateRow;
        const saved = await persistFn(rowToSave);

        onRowUiSync(rowToSave.rowId, { ...saved, isDraft: false });
        dispatch({ type: "EVENT_COMMIT_SUCCESS" });
      } catch (err) {
        logger.error(TAG, err);
        dispatch({ type: "EVENT_CANCEL" });
      }
    };
    performSave();
  }, [state.currentStep, state.editingRow, persistNewRow, persistUpdateRow, onRowUiSync, dispatch]);
}

interface WorkflowTableProps {
  initialRows: ProcedureRow[];
  month: number;
  year: number;
  allPatients: Patient[];
  allFunds: AffiliatedFund[];
  allProcedureTypes: ProcedureType[];

  // Callback to synchronize the local state of the page
  onRowUiSync: (rowId: string, updateFields: Partial<ProcedureRow>) => void;
  onAddNewRow: () => void;

  // Request database update
  persistNewRow: (row: ProcedureRow) => Promise<ProcedureRow>;
  persistUpdateRow: (row: ProcedureRow) => Promise<ProcedureRow>;
  persistNewPatient: (data: CreatePatientFormData) => Promise<Patient>;
  persistNewFund: (data: CreateFundFormData) => Promise<AffiliatedFund>;
  persistNewProcedureType: (data: CreateProcedureTypeFormData) => Promise<ProcedureType>;

  // Modal editing
  onEdit?: (row: ProcedureRow) => void;
  onDelete?: (id: string) => void;
  editingRowId?: string | null;
}

export function WorkflowTable({
  initialRows,
  month,
  year,
  allPatients,
  allFunds,
  allProcedureTypes,
  onRowUiSync,
  onAddNewRow,
  persistNewRow,
  persistUpdateRow,
  persistNewPatient,
  persistNewFund,
  persistNewProcedureType,
  onEdit,
  onDelete,
  editingRowId,
}: WorkflowTableProps) {
  // state reducer
  const [state, dispatch] = useReducer(reduceWorkflowState, {
    focusedRowId: null,
    currentStep: "IDLE",
    editingRow: null,
  });

  const displayRows = initialRows.map((row) =>
    state.focusedRowId === row.rowId && state.editingRow ? state.editingRow : row,
  );

  const modals = useProcedureFormModals();

  // derived state (memos)
  const tableContext = useMemo(() => {
    const monthStr = month.toString().padStart(2, "0");
    return {
      maxDays: new Date(year, month, 0).getDate(),
      isoPrefix: `${year}-${monthStr}-`,
    };
  }, [month, year]);

  const latestDate = useMemo(() => {
    const dates = initialRows
      .map((r) => r.procedureDate)
      .filter((d): d is string => !!d && d !== "")
      .sort();

    if (dates.length === 0) {
      return `${tableContext.isoPrefix}01`;
    }

    return dates[dates.length - 1];
  }, [initialRows, tableContext.isoPrefix]);

  // actions registry
  const actions = useMemo<WorkflowAction>(
    () => ({
      selectPatient: (patient) => {
        logger.debug(TAG, patient);

        // Lookup tracking field references for auto-fill
        const trackedFund = patient.latest_fund
          ? allFunds.find((f) => f.id === patient.latest_fund)
          : undefined;
        const trackedProcedureType = patient.latest_procedure_type
          ? allProcedureTypes.find((pt) => pt.id === patient.latest_procedure_type)
          : undefined;

        dispatch({
          type: "EVENT_SELECT_PATIENT",
          patient,
          trackedFund,
          trackedProcedureType,
          // Convert from thousandths to euros for the view layer
          trackedAmount:
            patient.latest_procedure_amount != null
              ? patient.latest_procedure_amount / 1000
              : undefined,
        });
      },

      selectFund: (fund) => {
        logger.debug(TAG, fund);
        dispatch({ type: "EVENT_SELECT_FUND", fund });
      },

      selectProcedureType: (procedureType) => {
        logger.debug(TAG, procedureType);
        dispatch({ type: "EVENT_SELECT_PROCEDURE_TYPE", procedureType });
      },

      enterDate: (date) => {
        logger.debug(TAG, date);
        dispatch({ type: "EVENT_ENTER_DATE", date });
      },

      enterAmount: (amount) => {
        logger.debug(TAG, amount);
        dispatch({ type: "EVENT_ENTER_AMOUNT", amount });
      },

      activate: (rowId: string, clickedStep: WorkflowStep) => {
        dispatch({
          type: "EVENT_FOCUS_CELL",
          rowId,
          clickedStep,
          initialRows: initialRows,
          latestDateHint: latestDate,
        });
      },
    }),
    [initialRows, allFunds, allProcedureTypes, latestDate],
  );

  const { t } = useTranslation("procedure");

  useTableLifeCycle(state, dispatch, initialRows, onAddNewRow, latestDate ?? "");
  useTablePersistance(state, dispatch, { persistNewRow, persistUpdateRow, onRowUiSync });

  // Sync draft changes back to parent state so they persist across period switches
  useEffect(() => {
    if (state.editingRow && state.focusedRowId && state.editingRow.isDraft) {
      onRowUiSync(state.focusedRowId, state.editingRow);
    }
  }, [state.editingRow, state.focusedRowId, onRowUiSync]);

  const bundle: WorkflowBundle = useMemo(
    () => ({
      state, // changes often but memo comparison in WorkflowRow prevents unnecessary re-renders
      actions,
      dispatch,
      modals,
    }),
    [state, actions, modals],
  );

  return (
    <div className={TABLE_STYLES.container}>
      <div className={TABLE_STYLES.tableWrapper}>
        <table className={TABLE_STYLES.table}>
          <thead className={TABLE_STYLES.thead}>
            <tr>
              <th className={`${TABLE_STYLES.th} ${COL_WIDTHS.patientName}`}>
                {t("table.patient")}
              </th>
              <th className={`${TABLE_STYLES.th} ${COL_WIDTHS.ssn}`}>{t("table.ssn")}</th>
              <th className={`${TABLE_STYLES.th} ${COL_WIDTHS.fundId}`}>{t("table.fundCode")}</th>
              <th className={`${TABLE_STYLES.th} ${COL_WIDTHS.fundName}`}>{t("table.fundName")}</th>
              <th className={`${TABLE_STYLES.th} ${COL_WIDTHS.procedureType}`}>
                {t("table.procedureType")}
              </th>
              <th className={`${TABLE_STYLES.th} ${COL_WIDTHS.date}`}>{t("table.date")}</th>
              <th className={`${TABLE_STYLES.th} ${COL_WIDTHS.amount}`}>{t("table.amount")}</th>
              <th className={`${TABLE_STYLES.th} w-24`}>{t("table.paymentMethod")}</th>
              <th className={`${TABLE_STYLES.th} w-28`}>{t("table.confirmedDate")}</th>
              <th className={`${TABLE_STYLES.th} w-28`}>{t("table.status")}</th>
              <th className={TABLE_STYLES.th}></th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {displayRows.map((row) => (
              <WorkflowRow
                key={row.rowId}
                row={row}
                isFocused={state.focusedRowId === row.rowId}
                bundle={bundle}
                allPatients={allPatients}
                allFunds={allFunds}
                allProcedureTypes={allProcedureTypes}
                tableContext={tableContext}
                onEdit={onEdit}
                onDelete={onDelete}
                editingRowId={editingRowId}
              />
            ))}
          </tbody>
        </table>
      </div>
      <CreateFormHub
        {...bundle}
        onSavePatient={persistNewPatient}
        onSaveFund={persistNewFund}
        onSaveProcedureType={persistNewProcedureType}
      />
    </div>
  );
}
