import { Edit, Trash2 } from "lucide-react";
import React, { type Dispatch } from "react";
import { useTranslation } from "react-i18next";
import type { AffiliatedFund, Patient, ProcedureType } from "@/bindings";
import type { ProcedureFormModals } from "../hooks/useProcedureFormModals";
import type { ProcedureRow, WorkflowAction, WorkflowState } from "../model";
import { formatDateDisplay } from "../model";
import type { WorkflowEvent } from "../model/workflow.types";
import {
  AmountCell,
  DateCell,
  FundCell,
  PatientCell,
  ProcedureTypeCell,
  StaticCell,
  StatusCell,
} from "./cell";
import { COL_WIDTHS, TABLE_STYLES } from "./ui.styles";

export interface WorkflowBundle {
  state: WorkflowState;
  actions: WorkflowAction;
  dispatch: Dispatch<WorkflowEvent>;
  modals: ProcedureFormModals;
}

// On définit les props nécessaires pour une ligne
interface WorkflowRowProps {
  row: ProcedureRow;
  isFocused: boolean;
  bundle: WorkflowBundle;
  allPatients: Patient[];
  allFunds: AffiliatedFund[];
  allProcedureTypes: ProcedureType[];
  tableContext: { maxDays: number; isoPrefix: string };
  onEdit?: (row: ProcedureRow) => void;
  onDelete?: (id: string) => void;
  editingRowId?: string | null;
}

export const WorkflowRow = React.memo(
  ({
    row,
    isFocused,
    bundle,
    allPatients,
    allFunds,
    allProcedureTypes,
    tableContext,
    onEdit,
    onDelete,
    editingRowId,
  }: WorkflowRowProps) => {
    const { t } = useTranslation("procedure");
    const isSavingThisRow =
      bundle.state.currentStep === "SAVING" && bundle.state.focusedRowId === row.rowId;
    const isBeingEditedInModal = editingRowId === row.id;

    const handleDelete = () => {
      if (row.id) onDelete?.(row.id);
    };

    // Wrap the actions to prevent inline editing when modal is open
    const wrappedActions = isBeingEditedInModal
      ? {
          ...bundle.actions,
          activate: () => {
            // Do nothing when modal is editing this row
          },
        }
      : bundle.actions;

    const wrappedBundle = { ...bundle, actions: wrappedActions };

    return (
      <tr
        className={`${TABLE_STYLES.row} ${
          isFocused ? TABLE_STYLES.rowActive : TABLE_STYLES.rowHover
        } ${
          // Feedback visuel : translucide + curseur d'attente + clic interdit
          isSavingThisRow ? "opacity-50 pointer-events-none cursor-wait bg-slate-50" : ""
        }`}
      >
        <PatientCell {...wrappedBundle} row={row} allPatients={allPatients} />
        <StaticCell value={row.ssn} widthClass={COL_WIDTHS.ssn} />

        <FundCell {...wrappedBundle} row={row} allFunds={allFunds} />
        <StaticCell value={row.fundName} widthClass={COL_WIDTHS.fundName} />

        <ProcedureTypeCell {...wrappedBundle} row={row} allProcedureTypes={allProcedureTypes} />

        <DateCell {...wrappedBundle} row={row} tableContext={tableContext} />
        <AmountCell {...wrappedBundle} row={row} />

        {/* Payment method (readonly) */}
        <StaticCell
          value={row.paymentMethod ? formatPaymentMethod(row.paymentMethod, t) : "—"}
          widthClass="w-24"
        />

        {/* Confirmed payment date (readonly) */}
        <StaticCell
          value={row.confirmedPaymentDate ? formatDateDisplay(row.confirmedPaymentDate) : "—"}
          widthClass="w-28"
        />

        {/* Procedure status */}
        <StatusCell status={row.status} />

        {/* Action buttons */}
        <td className="px-2 py-2 text-right w-24">
          {row.id && (
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => onEdit?.(row)}
                disabled={isSavingThisRow || isBeingEditedInModal}
                className="p-1 text-slate-600 hover:text-slate-900 disabled:text-slate-400 disabled:cursor-not-allowed"
                title={t("action.editTitle")}
              >
                <Edit className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isSavingThisRow || isBeingEditedInModal}
                className="p-1 text-red-600 hover:text-red-700 disabled:text-slate-400 disabled:cursor-not-allowed"
                title={t("action.deleteTitle")}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </td>
      </tr>
    );
  },
  (prev, next) => {
    // Re-render seulement lors des transitions vers/depuis SAVING (pour le feedback visuel)
    const prevIsSaving = prev.bundle.state.currentStep === "SAVING";
    const nextIsSaving = next.bundle.state.currentStep === "SAVING";
    if (prevIsSaving !== nextIsSaving) {
      return false;
    }

    // Si la ligne n'est pas focus et qu'elle ne l'était pas avant,
    // on ne la re-render pas (sauf si la donnée brute de la ligne a changé)
    if (!prev.isFocused && !next.isFocused) {
      return prev.row === next.row;
    }
    return false;
  },
);

// Optionnel : donner un nom pour le debug React DevTools
WorkflowRow.displayName = "WorkflowRow";

function formatPaymentMethod(method: string, t: (key: string) => string): string {
  const paymentMethods: Record<string, string> = {
    NONE: t("form.payment.none"),
    CASH: t("form.payment.cash"),
    CHECK: t("form.payment.check"),
    BANK_CARD: t("form.payment.card"),
    BANK_TRANSFER: t("form.payment.transfer"),
  };
  return paymentMethods[method] || method;
}
