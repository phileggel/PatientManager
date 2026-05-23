/**
 * ProcedureTypeList - Procedure Type Data Table with CRUD Actions
 *
 * - Data: useProcedureTypeList (reads store, applies toRow() transformation)
 * - Sorting/filtering: useSortProcedureTypeList
 * - Delete: confirmation dialog, calls deleteProcedureType service
 * - Edit: double-click or Edit button opens EditProcedureTypeModal
 * - Updates: event-driven from useCacheSync
 */

import { Edit2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProcedureType } from "@/bindings";
import { logger } from "@/infra/logger";
import { Button, ConfirmationDialog, IconButton, SortIcon } from "@/ui/components";
import { toastService } from "@/ui/components/snackbar";
import { useFormatters } from "@/ui/format/formatters";
import { EditProcedureTypeModal } from "../edit_procedure_type_modal/EditProcedureTypeModal";
import type { ProcedureTypeRow } from "../shared/types";
import { useDoubleClickRow } from "./useDoubleClickRow";
import { useProcedureTypeList } from "./useProcedureTypeList";
import { useSortProcedureTypeList } from "./useSortProcedureTypeList";

interface ProcedureTypeListProps {
  searchTerm: string;
}

export function ProcedureTypeList({ searchTerm }: ProcedureTypeListProps) {
  const { t } = useTranslation("procedure-type");
  const { t: tc } = useTranslation("common");
  const { formatCurrency } = useFormatters();

  useEffect(() => {
    logger.info("[ProcedureTypeList] Component mounted");
  }, []);

  const { procedureTypeRows, procedureTypes, loading, error, retry, deleteProcedureType } =
    useProcedureTypeList();
  const { sortedAndFilteredProcedureTypes, sortConfig, handleSort } = useSortProcedureTypeList(
    procedureTypeRows,
    searchTerm,
  );

  // Modals
  const [deleteData, setDeleteData] = useState<{ id: string; name: string } | null>(null);
  const [editData, setEditData] = useState<ProcedureType | null>(null);

  const onDoubleClick = useCallback(
    (id: string) => {
      const pt = procedureTypes.find((p) => p.id === id);
      if (pt) setEditData(pt);
    },
    [procedureTypes],
  );
  const { handleRowClick } = useDoubleClickRow(onDoubleClick);

  return (
    <div className="m3-table-container flex-1">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-m3-surface-container z-10">
          <tr>
            <th className="m3-th" onClick={() => handleSort("name")}>
              <div className="flex items-center">
                {t("list.name")}{" "}
                <SortIcon active={sortConfig.key === "name"} direction={sortConfig.direction} />
              </div>
            </th>
            <th className="m3-th text-right" onClick={() => handleSort("defaultAmount")}>
              <div className="flex items-center justify-end">
                {t("list.amount")}{" "}
                <SortIcon
                  active={sortConfig.key === "defaultAmount"}
                  direction={sortConfig.direction}
                />
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
          ) : error ? (
            <tr>
              <td colSpan={4} className="m3-td text-center py-12">
                <p className="text-m3-error mb-3">{t("list.loadError")}</p>
                <Button variant="secondary" size="sm" onClick={retry}>
                  {t("list.retry")}
                </Button>
              </td>
            </tr>
          ) : procedureTypeRows.length === 0 && !searchTerm ? (
            <tr>
              <td colSpan={4} className="m3-td text-center py-12 text-m3-on-surface-variant">
                {t("list.empty")}
              </td>
            </tr>
          ) : sortedAndFilteredProcedureTypes.length === 0 ? (
            <tr>
              <td colSpan={4} className="m3-td text-center py-12 text-m3-on-surface-variant">
                {t("list.noResults")}
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
                  <td className="m3-td text-m3-on-surface">{formatCurrency(row.defaultAmount)}</td>
                  <td className="m3-td text-m3-on-surface">{row.category || "-"}</td>
                  <td className="m3-td text-right">
                    <div className="flex items-center justify-end gap-1">
                      <IconButton
                        variant="ghost"
                        size="sm"
                        shape="round"
                        aria-label={t("action.editAriaLabel", { name: row.name })}
                        icon={<Edit2 size={16} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (procedureTypeObject) setEditData(procedureTypeObject);
                        }}
                      />
                      <IconButton
                        variant="danger"
                        size="sm"
                        shape="round"
                        aria-label={t("action.deleteAriaLabel", { name: row.name })}
                        icon={<Trash2 size={16} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (row.id && row.name) setDeleteData({ id: row.id, name: row.name });
                        }}
                      />
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
        id="delete-procedure-type-confirmation"
        isOpen={!!deleteData}
        onCancel={() => setDeleteData(null)}
        onConfirm={async () => {
          if (deleteData) {
            try {
              await deleteProcedureType(deleteData.id);
              setDeleteData(null);
              toastService.show("success", t("action.delete.success", { name: deleteData.name }));
            } catch (err) {
              logger.error("Delete procedure type failed", {
                error: err,
                procedureTypeId: deleteData.id,
              });
              const message = err instanceof Error ? err.message : String(err);
              toastService.show("error", t("action.delete.error", { error: message }));
            }
          }
        }}
        title={t("action.delete.title")}
        message={t("action.delete.message", { name: deleteData?.name })}
        confirmLabel={t("action.delete.confirm")}
        cancelLabel={tc("action.cancel")}
        variant="danger"
      />
    </div>
  );
}
