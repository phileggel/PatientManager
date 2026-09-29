import { Edit2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmationDialog, IconButton, SortIcon } from "@/ui/components";
import { EditBankStatementLabelModal } from "../edit_bank_statement_label_modal/EditBankStatementLabelModal";
import {
  assignmentText,
  type BankStatementLabelRow,
  filterAndSortRows,
  type SortConfig,
  type SortKey,
} from "../shared/presenter";
import type { useBankStatementLabelList } from "./useBankStatementLabelList";

type BankStatementLabelListProps = ReturnType<typeof useBankStatementLabelList> & {
  searchTerm: string;
};

/** BAS-041–045 — the table of saved bank statement labels with its row actions. */
export function BankStatementLabelList({
  searchTerm,
  rows,
  loading,
  loadFailed,
  reassign,
  remove,
}: BankStatementLabelListProps) {
  const { t } = useTranslation("bank");
  const [sort, setSort] = useState<SortConfig | null>(null);
  const [editing, setEditing] = useState<BankStatementLabelRow | null>(null);
  const [deleting, setDeleting] = useState<BankStatementLabelRow | null>(null);

  const texts = useMemo(
    () => ({
      ignored: t("statement_label.ignored"),
      deletedFund: t("statement_label.deleted_fund"),
    }),
    [t],
  );
  const visible = useMemo(
    () => filterAndSortRows(rows, searchTerm, sort, texts),
    [rows, searchTerm, sort, texts],
  );

  // BAS-041A — each column cycles ascending → descending → default order.
  const handleSort = (key: SortKey) =>
    setSort((prev) => {
      if (prev?.key !== key) return { key, direction: "asc" };
      return prev.direction === "asc" ? { key, direction: "desc" } : null;
    });

  const header = (key: SortKey) => (
    <th className="m3-th" onClick={() => handleSort(key)}>
      <div className="flex items-center">
        {t(`statement_label.columns.${key}`)}{" "}
        <SortIcon
          active={sort?.key === key}
          direction={sort?.key === key ? sort.direction : "asc"}
        />
      </div>
    </th>
  );

  const message = loading
    ? t("statement_label.loading")
    : loadFailed
      ? t("statement_label.load_error")
      : visible.length === 0
        ? t("statement_label.empty")
        : null;

  return (
    <div id="bank-statement-label-list" className="m3-table-container flex-1">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-m3-surface-container z-10">
          <tr>
            {header("account")}
            {header("label")}
            {header("fund")}
            <th className="m3-th text-right">{t("statement_label.columns.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {message ? (
            <tr>
              <td
                id="bank-statement-label-message"
                colSpan={4}
                className="m3-td text-center py-12 text-m3-on-surface-variant"
              >
                {message}
              </td>
            </tr>
          ) : (
            visible.map((row) => (
              <tr
                key={row.id}
                id={`bank-statement-label-row-${row.id}`}
                className="m3-tr cursor-pointer select-none"
                onDoubleClick={() => setEditing(row)}
                title={t("statement_label.double_click_to_edit")}
              >
                <td className="m3-td text-m3-on-surface-variant">{row.accountName}</td>
                <td className="m3-td font-mono text-sm text-m3-on-surface">{row.label}</td>
                <td className="m3-td">
                  {row.assignment.kind === "fund" ? (
                    <span className="text-m3-on-surface">{row.assignment.fundName}</span>
                  ) : (
                    <span
                      className={`text-xs font-semibold rounded-full px-2 py-1 ${
                        row.assignment.kind === "ignored"
                          ? "bg-m3-surface-variant text-m3-on-surface-variant"
                          : "bg-m3-error-container text-m3-on-error-container"
                      }`}
                    >
                      {assignmentText(row.assignment, texts)}
                    </span>
                  )}
                </td>
                <td className="m3-td text-right">
                  <div className="flex items-center justify-end gap-1">
                    <IconButton
                      id={`bank-statement-label-edit-${row.id}`}
                      variant="ghost"
                      size="sm"
                      shape="round"
                      aria-label={t("statement_label.edit_aria_label", { label: row.label })}
                      icon={<Edit2 size={16} />}
                      onClick={() => setEditing(row)}
                    />
                    <IconButton
                      id={`bank-statement-label-delete-${row.id}`}
                      variant="danger"
                      size="sm"
                      shape="round"
                      aria-label={t("statement_label.delete_aria_label", { label: row.label })}
                      icon={<Trash2 size={16} />}
                      onClick={() => setDeleting(row)}
                    />
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <EditBankStatementLabelModal
        row={editing}
        onSubmit={reassign}
        onClose={() => setEditing(null)}
      />

      <ConfirmationDialog
        id="delete-bank-statement-label-confirmation"
        isOpen={!!deleting}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await remove(deleting.id);
          setDeleting(null);
        }}
        title={t("statement_label.delete.title")}
        message={t("statement_label.delete.message", { label: deleting?.label ?? "" })}
        confirmLabel={t("statement_label.delete.confirm")}
        cancelLabel={t("statement_label.delete.cancel")}
        variant="danger"
      />
    </div>
  );
}
