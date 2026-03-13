/**
 * FundList - Fund Data Table with CRUD Actions
 *
 * - Data: useFundList (reads store, applies toRow() transformation)
 * - Sorting/filtering: useSortFundList
 * - Delete: confirmation dialog, calls deleteFund service
 * - Edit: double-click or Edit button opens EditFundModal
 * - Updates: event-driven from useAppInit
 */

import { ArrowDown, ArrowUp, Edit2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AffiliatedFund } from "@/bindings";

import { toastService } from "@/core/snackbar";
import { logger } from "@/lib/logger";
import { ConfirmationDialog } from "@/ui/components";
import { EditFundModal } from "../edit_fund_modal/EditFundModal";
import type { FundRow } from "../shared/types";
import { useFundList } from "./useFundList";
import type { SortConfig } from "./useSortFundList";
import { useSortFundList } from "./useSortFundList";

// Moved outside component to avoid recreation on every render
function SortIcon({ sortConfig, column }: { sortConfig: SortConfig; column: SortConfig["key"] }) {
  if (sortConfig.key !== column) return null;
  return sortConfig.direction === "asc" ? (
    <ArrowUp size={14} className="ml-1 text-m3-primary" />
  ) : (
    <ArrowDown size={14} className="ml-1 text-m3-primary" />
  );
}

interface FundListProps {
  searchTerm: string;
}

export function FundList({ searchTerm }: FundListProps) {
  const { t } = useTranslation("fund");
  const { t: tc } = useTranslation("common");
  const { fundRows, funds, loading, deleteFund } = useFundList();

  useEffect(() => {
    logger.info("[FundList] Component mounted");
  }, []);
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [lastClickTime, setLastClickTime] = useState<number>(0);
  const { sortedAndFilteredFunds, sortConfig, handleSort } = useSortFundList(fundRows, searchTerm);

  // Modals
  const [deleteData, setDeleteData] = useState<{ id: string; name: string } | null>(null);
  const [editData, setEditData] = useState<AffiliatedFund | null>(null);

  const handleRowClick = (fundId: string | undefined) => {
    if (!fundId) return;

    const now = Date.now();
    const isDoubleClick = lastClickedId === fundId && now - lastClickTime < 300;

    setLastClickedId(fundId);
    setLastClickTime(now);

    if (isDoubleClick) {
      const fundObject = funds.find((f) => f.id === fundId);
      if (fundObject) {
        setEditData(fundObject);
      }
    }
  };

  return (
    <div className="m3-table-container flex-1">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-m3-surface-container z-10">
          <tr>
            <th className="m3-th" onClick={() => handleSort("fundIdentifier")}>
              <div className="flex items-center">
                {t("list.identifier")} <SortIcon sortConfig={sortConfig} column="fundIdentifier" />
              </div>
            </th>
            <th className="m3-th text-right" onClick={() => handleSort("fundName")}>
              <div className="flex items-center">
                {t("list.name")} <SortIcon sortConfig={sortConfig} column="fundName" />
              </div>
            </th>
            <th className="m3-th text-right">{tc("table.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={3} className="m3-td text-center py-12">
                <span className="text-m3-on-surface-variant animate-pulse">
                  {t("list.loading")}
                </span>
              </td>
            </tr>
          ) : sortedAndFilteredFunds.length === 0 ? (
            <tr>
              <td colSpan={3} className="m3-td text-center py-12 text-m3-on-surface-variant">
                {t("list.noData")}
              </td>
            </tr>
          ) : (
            sortedAndFilteredFunds.map((fund: FundRow) => {
              const fundObject = funds.find((f) => f.id === fund.id);
              return (
                <tr
                  key={fund.rowId}
                  onClick={() => handleRowClick(fund.id)}
                  className="m3-tr cursor-pointer select-none"
                  title={tc("table.doubleClickToEdit")}
                >
                  <td className="m3-td font-medium text-m3-on-surface">{fund.fundIdentifier}</td>
                  <td className="m3-td text-m3-on-surface">{fund.fundName}</td>
                  <td className="m3-td text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        className="m3-icon-button-primary"
                        aria-label={t("action.editAriaLabel", { name: fund.fundName || "" })}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (fundObject) {
                            setEditData(fundObject);
                          }
                        }}
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        type="button"
                        className="m3-icon-button-error"
                        aria-label={t("action.deleteAriaLabel", { name: fund.fundName || "" })}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (fund.id && fund.fundName) {
                            setDeleteData({ id: fund.id, name: fund.fundName });
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

      {/* Edit Fund Modal */}
      <EditFundModal isOpen={!!editData} onClose={() => setEditData(null)} fund={editData} />

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={!!deleteData}
        onCancel={() => setDeleteData(null)}
        onConfirm={async () => {
          if (deleteData) {
            try {
              await deleteFund(deleteData.id);
              setDeleteData(null);
              toastService.show("success", t("action.delete.success", { name: deleteData.name }));
            } catch (error) {
              logger.error("Delete fund failed", { error, fundId: deleteData.id });
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
