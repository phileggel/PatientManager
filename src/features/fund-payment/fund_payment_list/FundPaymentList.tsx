/**
 * FundPaymentList - Payment Group Data Table with CRUD Actions
 *
 * - Data: useFundPaymentList (reads groups, applies toRow() transformation)
 * - Sorting/filtering: useSortFundPaymentList
 * - Delete: confirmation dialog (handled in Manager)
 * - Edit: double-click or Edit button opens EditFundPaymentModal
 */

import { ArrowDown, ArrowUp, Edit, Lock, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FundPaymentGroup } from "@/bindings";
import { toastService } from "@/core/snackbar";
import { logger } from "@/lib/logger";
import { ConfirmationDialog } from "@/ui/components";
import { EditFundPaymentModal } from "../edit_fund_payment_modal/EditFundPaymentModal";
import type { FundPaymentRow } from "../shared/types";
import { useFundPaymentList } from "./useFundPaymentList";
import type { SortConfig } from "./useSortFundPaymentList";
import { useSortFundPaymentList } from "./useSortFundPaymentList";

// Moved outside component to avoid recreation on every render
function SortIcon({ sortConfig, column }: { sortConfig: SortConfig; column: SortConfig["key"] }) {
  if (sortConfig.key !== column) return null;
  return sortConfig.direction === "asc" ? (
    <ArrowUp size={14} className="ml-1 text-m3-primary" />
  ) : (
    <ArrowDown size={14} className="ml-1 text-m3-primary" />
  );
}

export default function FundPaymentList() {
  const { t } = useTranslation("fund-payment");
  const { t: tc } = useTranslation("common");
  const { fundPaymentRows, groups, loading, deleteGroup } = useFundPaymentList();
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    logger.info("[FundPaymentList] Component mounted");
  }, []);

  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [lastClickTime, setLastClickTime] = useState<number>(0);
  const { sortedAndFilteredGroups, sortConfig, handleSort } = useSortFundPaymentList(
    fundPaymentRows,
    searchTerm,
  );

  const [editingPayment, setEditingPayment] = useState<FundPaymentGroup | null>(null);
  const [deleteData, setDeleteData] = useState<{ id: string; fundName: string } | null>(null);

  const handleRowClick = (groupId: string, isLocked: boolean) => {
    const now = Date.now();
    const isDoubleClick = lastClickedId === groupId && now - lastClickTime < 300;

    setLastClickedId(groupId);
    setLastClickTime(now);

    if (isDoubleClick && !isLocked) {
      const groupObject = groups.find((g) => g.id === groupId);
      if (groupObject) {
        setEditingPayment(groupObject);
      }
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between p-6 border-b border-neutral-30">
        <h2 className="text-xl font-semibold text-neutral-90">
          {t("list.title", { count: groups.length })}
        </h2>
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-60" size={18} />
          <input
            type="text"
            placeholder={t("list.searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="m3-input pl-10 w-full"
          />
        </div>
      </div>

      <div className="m3-table-container flex-1">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-m3-surface-container z-10">
            <tr>
              <th className="m3-th" onClick={() => handleSort("fundName")}>
                <div className="flex items-center">
                  {t("list.columns.fund")} <SortIcon sortConfig={sortConfig} column="fundName" />
                </div>
              </th>
              <th className="m3-th" onClick={() => handleSort("paymentDate")}>
                <div className="flex items-center">
                  {t("list.columns.date")} <SortIcon sortConfig={sortConfig} column="paymentDate" />
                </div>
              </th>
              <th className="m3-th text-right" onClick={() => handleSort("totalAmount")}>
                <div className="flex items-center justify-end">
                  {t("list.columns.amount")}{" "}
                  <SortIcon sortConfig={sortConfig} column="totalAmount" />
                </div>
              </th>
              <th className="m3-th text-right" onClick={() => handleSort("procedureCount")}>
                <div className="flex items-center justify-end">
                  {t("list.columns.procedures")}{" "}
                  <SortIcon sortConfig={sortConfig} column="procedureCount" />
                </div>
              </th>
              <th className="m3-th text-right">{t("list.columns.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="m3-td text-center py-12">
                  <span className="text-m3-on-surface-variant animate-pulse">
                    {t("list.loading")}
                  </span>
                </td>
              </tr>
            ) : sortedAndFilteredGroups.length === 0 ? (
              <tr>
                <td colSpan={5} className="m3-td text-center py-12 text-m3-on-surface-variant">
                  {t("list.empty")}
                </td>
              </tr>
            ) : (
              sortedAndFilteredGroups.map((group: FundPaymentRow) => {
                const groupObject = groups.find((g) => g.id === group.id);
                return (
                  <tr
                    key={group.rowId}
                    onClick={() => handleRowClick(group.id, group.isLocked)}
                    className={`m3-tr select-none ${group.isLocked ? "cursor-default opacity-70" : "cursor-pointer"}`}
                    title={group.isLocked ? t("list.lockedHint") : t("list.rowEditHint")}
                  >
                    <td className="m3-td font-medium text-m3-on-surface">
                      <div className="flex items-center gap-2">
                        {group.isLocked && (
                          <Lock size={14} className="text-m3-on-surface-variant shrink-0" />
                        )}
                        {group.fundName}
                      </div>
                    </td>
                    <td className="m3-td text-m3-on-surface-variant font-mono text-sm">
                      {group.paymentDate}
                    </td>
                    <td className="m3-td text-m3-on-surface font-semibold text-right">
                      €{group.totalAmount.toFixed(2)}
                    </td>
                    <td className="m3-td text-m3-on-surface text-right">{group.procedureCount}</td>
                    <td className="m3-td text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          className="m3-icon-button-primary"
                          aria-label={t("action.editAriaLabel", { name: group.fundName })}
                          disabled={group.isLocked}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (groupObject && !group.isLocked) {
                              setEditingPayment(groupObject);
                            }
                          }}
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          type="button"
                          className="m3-icon-button-error"
                          aria-label={t("action.deleteAriaLabel", { name: group.fundName })}
                          disabled={group.isLocked}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!group.isLocked) {
                              setDeleteData({ id: group.id, fundName: group.fundName });
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
      </div>

      {editingPayment && (
        <EditFundPaymentModal payment={editingPayment} onClose={() => setEditingPayment(null)} />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={!!deleteData}
        onCancel={() => setDeleteData(null)}
        onConfirm={async () => {
          if (deleteData) {
            try {
              await deleteGroup(deleteData.id);
              toastService.show(
                "success",
                t("list.delete.success", { fundName: deleteData.fundName }),
              );
              setDeleteData(null);
            } catch (error) {
              logger.error("Delete fund payment group failed", { error, groupId: deleteData.id });
              toastService.show("error", t("list.delete.error", { error: String(error) }));
            }
          }
        }}
        title={t("list.delete.title")}
        message={t("list.delete.message", { fundName: deleteData?.fundName })}
        confirmLabel={t("list.delete.confirm")}
        cancelLabel={tc("action.cancel")}
        variant="danger"
      />
    </div>
  );
}
