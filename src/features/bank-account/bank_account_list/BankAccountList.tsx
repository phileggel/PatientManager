/**
 * BankAccountList - Bank Account Data Table with CRUD Actions
 *
 * - Data: useBankAccountList (reads store, applies toRow() transformation)
 * - Sorting/filtering: useSortBankAccountList
 * - Delete: confirmation dialog, calls deleteBankAccount service
 * - Edit: double-click or Edit button opens EditBankAccountModal
 * - Updates: event-driven from useAppInit
 */

import { ArrowDown, ArrowUp, Edit2, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { BankAccount } from "@/bindings";
import { useSnackbar } from "@/core/snackbar";
import { logger } from "@/lib/logger";
import { ConfirmationDialog } from "@/ui/components";
import { EditBankAccountModal } from "../edit_bank_account_modal/EditBankAccountModal";
import type { BankAccountRow } from "../shared/types";
import { useBankAccountList } from "./useBankAccountList";
import type { SortConfig } from "./useSortBankAccountList";
import { useSortBankAccountList } from "./useSortBankAccountList";

// Moved outside component to avoid recreation on every render
function SortIcon({ sortConfig, column }: { sortConfig: SortConfig; column: SortConfig["key"] }) {
  if (sortConfig.key !== column) return null;
  return sortConfig.direction === "asc" ? (
    <ArrowUp size={14} className="ml-1 text-m3-primary" />
  ) : (
    <ArrowDown size={14} className="ml-1 text-m3-primary" />
  );
}

interface BankAccountListProps {
  searchTerm: string;
}

export function BankAccountList({ searchTerm }: BankAccountListProps) {
  const { t } = useTranslation("bank");
  const { t: tCommon } = useTranslation("common");
  const { showSnackbar } = useSnackbar();
  const { bankAccountRows, accounts, loading, deleteBankAccount } = useBankAccountList();
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [lastClickTime, setLastClickTime] = useState<number>(0);
  const { sortedAndFilteredAccounts, sortConfig, handleSort } = useSortBankAccountList(
    bankAccountRows,
    searchTerm,
  );

  // Modals
  const [deleteData, setDeleteData] = useState<{ id: string; name: string } | null>(null);
  const [editData, setEditData] = useState<BankAccount | null>(null);

  const handleRowClick = (accountId: string | undefined) => {
    if (!accountId) return;

    const now = Date.now();
    const isDoubleClick = lastClickedId === accountId && now - lastClickTime < 300;

    setLastClickedId(accountId);
    setLastClickTime(now);

    if (isDoubleClick) {
      const accountObject = accounts.find((a) => a.id === accountId);
      if (accountObject) {
        setEditData(accountObject);
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
                {t("account.list.columns.name")} <SortIcon sortConfig={sortConfig} column="name" />
              </div>
            </th>
            <th className="m3-th" onClick={() => handleSort("iban")}>
              <div className="flex items-center">
                {t("account.list.columns.iban")} <SortIcon sortConfig={sortConfig} column="iban" />
              </div>
            </th>
            <th className="m3-th text-right">{t("account.list.columns.id")}</th>
            <th className="m3-th text-right">{tCommon("table.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={4} className="m3-td text-center py-12">
                <span className="text-m3-on-surface-variant animate-pulse">
                  {t("account.list.loading")}
                </span>
              </td>
            </tr>
          ) : sortedAndFilteredAccounts.length === 0 ? (
            <tr>
              <td colSpan={4} className="m3-td text-center py-12 text-m3-on-surface-variant">
                {t("account.list.empty")}
              </td>
            </tr>
          ) : (
            sortedAndFilteredAccounts.map((account: BankAccountRow) => {
              const accountObject = accounts.find((a) => a.id === account.id);
              return (
                <tr
                  key={account.rowId}
                  onClick={() => handleRowClick(account.id)}
                  className="m3-tr cursor-pointer select-none"
                  title={tCommon("table.doubleClickToEdit")}
                >
                  <td className="m3-td font-medium text-m3-on-surface">{account.name}</td>
                  <td className="m3-td text-m3-on-surface-variant font-mono text-sm">
                    {account.iban || "-"}
                  </td>
                  <td className="m3-td text-m3-on-surface font-mono text-right">
                    {account.id?.slice(0, 8)}
                  </td>
                  <td className="m3-td text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        className="m3-icon-button-primary"
                        aria-label={t("account.list.editAriaLabel", { name: account.name })}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (accountObject) {
                            setEditData(accountObject);
                          }
                        }}
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        type="button"
                        className="m3-icon-button-error"
                        aria-label={t("account.list.deleteAriaLabel", { name: account.name })}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (account.id && account.name) {
                            setDeleteData({ id: account.id, name: account.name });
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

      {/* Edit Bank Account Modal */}
      <EditBankAccountModal bankAccount={editData} onClose={() => setEditData(null)} />

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={!!deleteData}
        onCancel={() => setDeleteData(null)}
        onConfirm={async () => {
          if (deleteData) {
            try {
              await deleteBankAccount(deleteData.id);
              setDeleteData(null);
              showSnackbar("success", t("account.list.success.deleted", { name: deleteData.name }));
            } catch (error) {
              logger.error("Delete bank account failed", { error, accountId: deleteData.id });
              showSnackbar("error", t("account.list.error.delete", { error: String(error) }));
            }
          }
        }}
        title={t("account.list.delete.title")}
        message={t("account.list.delete.message", { name: deleteData?.name })}
        confirmLabel={t("account.list.delete.confirm")}
        cancelLabel={tCommon("action.cancel")}
        variant="danger"
      />
    </div>
  );
}
