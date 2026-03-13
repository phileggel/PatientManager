/**
 * ProcedureTypeList - Procedure Type Data Table with CRUD Actions
 *
 * - Data: useProcedureTypeList (reads store, applies toRow() transformation)
 * - Sorting/filtering: useSortProcedureTypeList
 * - Delete: confirmation dialog, calls deleteProcedureType service
 * - Edit: double-click or Edit button opens EditProcedureTypeModal
 * - Updates: event-driven from useAppInit
 */

import { ArrowDown, ArrowUp, Edit2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProcedureType } from "@/bindings";

import { toastService } from "@/core/snackbar";
import { logger } from "@/lib/logger";
import { ConfirmationDialog } from "@/ui/components";
import { EditProcedureTypeModal } from "../edit_procedure_type_modal/EditProcedureTypeModal";
import type { ProcedureTypeRow } from "../shared/types";
import { useProcedureTypeList } from "./useProcedureTypeList";
import type { SortConfig } from "./useSortProcedureTypeList";
import { useSortProcedureTypeList } from "./useSortProcedureTypeList";

// Moved outside component to avoid recreation on every render
function SortIcon({ sortConfig, column }: { sortConfig: SortConfig; column: SortConfig["key"] }) {
  if (sortConfig.key !== column) return null;
  return sortConfig.direction === "asc" ? (
    <ArrowUp size={14} className="ml-1 text-m3-primary" />
  ) : (
    <ArrowDown size={14} className="ml-1 text-m3-primary" />
  );
}

interface ProcedureTypeListProps {
  searchTerm: string;
}

export function ProcedureTypeList({ searchTerm }: ProcedureTypeListProps) {
  const { t } = useTranslation("procedure-type");
  const { t: tc } = useTranslation("common");

  useEffect(() => {
    logger.info("[ProcedureTypeList] Component mounted");
  }, []);
  const { procedureTypeRows, procedureTypes, loading, deleteProcedureType } =
    useProcedureTypeList();
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [lastClickTime, setLastClickTime] = useState<number>(0);
  const { sortedAndFilteredProcedureTypes, sortConfig, handleSort } = useSortProcedureTypeList(
    procedureTypeRows,
    searchTerm,
  );

  // Modals
  const [deleteData, setDeleteData] = useState<{ id: string; name: string } | null>(null);
  const [editData, setEditData] = useState<ProcedureType | null>(null);

  const handleRowClick = (procedureTypeId: string | undefined) => {
    if (!procedureTypeId) return;

    const now = Date.now();
    const isDoubleClick = lastClickedId === procedureTypeId && now - lastClickTime < 300;

    setLastClickedId(procedureTypeId);
    setLastClickTime(now);

    if (isDoubleClick) {
      const procedureTypeObject = procedureTypes.find((pt) => pt.id === procedureTypeId);
      if (procedureTypeObject) {
        setEditData(procedureTypeObject);
      }
    }
  };

  return (
    <div className="m3-table-container flex-1">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-m3-surface-container z-10">
          <tr>
            <th className="m3-th" onClick={() => handleSort("name")}>
              <div className="flex items-center">
                {t("list.name")} <SortIcon sortConfig={sortConfig} column="name" />
              </div>
            </th>
            <th className="m3-th text-right" onClick={() => handleSort("defaultAmount")}>
              <div className="flex items-center">
                {t("list.amount")} <SortIcon sortConfig={sortConfig} column="defaultAmount" />
              </div>
            </th>
            <th className="m3-th text-right">{t("list.category")}</th>
            <th className="m3-th text-right">{tc("table.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={4} className="m3-td text-center py-12">
                <span className="text-m3-on-surface-variant animate-pulse">
                  {t("list.loading")}
                </span>
              </td>
            </tr>
          ) : sortedAndFilteredProcedureTypes.length === 0 ? (
            <tr>
              <td colSpan={4} className="m3-td text-center py-12 text-m3-on-surface-variant">
                {t("list.noData")}
              </td>
            </tr>
          ) : (
            sortedAndFilteredProcedureTypes.map((row: ProcedureTypeRow) => {
              const procedureTypeObject = procedureTypes.find((pt) => pt.id === row.id);
              return (
                <tr
                  key={row.rowId}
                  onClick={() => handleRowClick(row.id)}
                  className="m3-tr cursor-pointer select-none"
                  title={tc("table.doubleClickToEdit")}
                >
                  <td className="m3-td font-medium text-m3-on-surface">{row.name}</td>
                  <td className="m3-td text-m3-on-surface">€{row.defaultAmount.toFixed(2)}</td>
                  <td className="m3-td text-m3-on-surface">{row.category || "-"}</td>
                  <td className="m3-td text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        className="m3-icon-button-primary"
                        aria-label={t("action.editAriaLabel", { name: row.name })}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (procedureTypeObject) {
                            setEditData(procedureTypeObject);
                          }
                        }}
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        type="button"
                        className="m3-icon-button-error"
                        aria-label={t("action.deleteAriaLabel", { name: row.name })}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (row.id && row.name) {
                            setDeleteData({ id: row.id, name: row.name });
                          }
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {/* Edit Procedure Type Modal */}
      <EditProcedureTypeModal
        isOpen={!!editData}
        onClose={() => setEditData(null)}
        procedureType={editData}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={!!deleteData}
        onCancel={() => setDeleteData(null)}
        onConfirm={async () => {
          if (deleteData) {
            try {
              await deleteProcedureType(deleteData.id);
              setDeleteData(null);
              toastService.show("success", t("action.delete.success", { name: deleteData.name }));
            } catch (error) {
              logger.error("Delete procedure type failed", {
                error,
                procedureTypeId: deleteData.id,
              });
              toastService.show("error", t("action.delete.error", { error: String(error) }));
            }
          }
        }}
        title={t("action.delete.title")}
        message={t("action.delete.message", { name: deleteData?.name })}
        confirmLabel={t("action.delete.confirm")}
        variant="danger"
      />
    </div>
  );
}
