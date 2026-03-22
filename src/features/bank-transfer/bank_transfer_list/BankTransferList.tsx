import { Edit2, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { BankTransfer } from "@/bindings";
import { logger } from "@/lib/logger";
import { IconButton } from "@/ui/components";

const TAG = "[BankTransferList]";

interface BankTransferListProps {
  transfers: BankTransfer[];
  loading: boolean;
  onEdit: (transfer: BankTransfer) => void;
  onDelete: (id: string) => void;
}

export function BankTransferList({ transfers, loading, onEdit, onDelete }: BankTransferListProps) {
  const { t } = useTranslation("bank");
  const { t: tCommon } = useTranslation("common");

  useEffect(() => {
    logger.info(TAG, "Component mounted");
  }, []);

  return (
    <div className="m3-table-container flex-1">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-m3-surface-container z-10">
          <tr>
            <th className="m3-th">{t("transfer.list.columns.date")}</th>
            <th className="m3-th text-right">{t("transfer.list.columns.amount")}</th>
            <th className="m3-th">{t("transfer.list.columns.type")}</th>
            <th className="m3-th">{t("transfer.list.columns.bankAccount")}</th>
            <th className="m3-th text-right">{tCommon("table.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={5} className="m3-td text-center py-12">
                <span className="text-m3-on-surface-variant animate-pulse">
                  {t("transfer.list.loading")}
                </span>
              </td>
            </tr>
          ) : transfers.length === 0 ? (
            <tr>
              <td colSpan={5} className="m3-td text-center py-12 text-m3-on-surface-variant">
                {t("transfer.list.empty")}
              </td>
            </tr>
          ) : (
            transfers.map((transfer) => (
              <tr key={transfer.id} className="m3-tr">
                <td className="m3-td text-m3-on-surface">
                  {new Date(transfer.transfer_date).toLocaleDateString("fr-FR")}
                </td>
                <td className="m3-td text-m3-on-surface font-semibold text-right">
                  €{(transfer.amount / 1000).toFixed(2)}
                </td>
                <td className="m3-td text-m3-on-surface capitalize">
                  {transfer.transfer_type === "FUND"
                    ? t("transfer.typeFund")
                    : transfer.transfer_type === "CHECK"
                      ? t("transfer.typeCheck")
                      : transfer.transfer_type === "CASH"
                        ? t("transfer.typeCash")
                        : t("transfer.typeCreditCard")}
                </td>
                <td
                  className="m3-td text-m3-on-surface-variant truncate max-w-[160px]"
                  title={transfer.bank_account.name}
                >
                  {transfer.bank_account.name}
                </td>
                <td className="m3-td text-right">
                  <div className="flex items-center justify-end gap-1">
                    <IconButton
                      variant="ghost"
                      size="sm"
                      shape="round"
                      aria-label={t("transfer.list.editAriaLabel", {
                        date: new Date(transfer.transfer_date).toLocaleDateString("fr-FR"),
                        amount: `€${(transfer.amount / 1000).toFixed(2)}`,
                      })}
                      icon={<Edit2 size={16} />}
                      onClick={() => onEdit(transfer)}
                    />
                    <IconButton
                      variant="danger"
                      size="sm"
                      shape="round"
                      aria-label={t("transfer.list.deleteAriaLabel", {
                        date: new Date(transfer.transfer_date).toLocaleDateString("fr-FR"),
                        amount: `€${(transfer.amount / 1000).toFixed(2)}`,
                      })}
                      icon={<Trash2 size={16} />}
                      onClick={() => onDelete(transfer.id)}
                    />
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
