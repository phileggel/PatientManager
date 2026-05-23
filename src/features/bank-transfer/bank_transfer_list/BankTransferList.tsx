import { Edit2, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { BankEntry } from "@/bindings";
import { logger } from "@/infra/logger";
import { IconButton } from "@/ui/components";
import { useFormatters } from "@/ui/format/formatters";

const TAG = "[BankTransferList]";

interface BankTransferListProps {
  transfers: BankEntry[];
  loading: boolean;
  onEdit: (transfer: BankEntry) => void;
  onDelete: (id: string) => void;
}

export function BankTransferList({ transfers, loading, onEdit, onDelete }: BankTransferListProps) {
  const { t } = useTranslation("bank");
  const { t: tCommon } = useTranslation("common");
  const { formatCurrency, formatDate } = useFormatters();

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
                <td className="m3-td text-m3-on-surface">{formatDate(transfer.transfer_date)}</td>
                <td className="m3-td text-m3-on-surface font-semibold text-right">
                  {formatCurrency(transfer.amount)}
                </td>
                <td className="m3-td text-m3-on-surface capitalize">
                  {transfer.transfer_type === "FUND_WIRE"
                    ? t("transfer.typeFund")
                    : transfer.transfer_type === "PATIENT_CHECK"
                      ? t("transfer.typeCheck")
                      : transfer.transfer_type === "PATIENT_CASH"
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
                        date: formatDate(transfer.transfer_date),
                        amount: formatCurrency(transfer.amount),
                      })}
                      icon={<Edit2 size={16} />}
                      onClick={() => onEdit(transfer)}
                    />
                    <IconButton
                      variant="danger"
                      size="sm"
                      shape="round"
                      aria-label={t("transfer.list.deleteAriaLabel", {
                        date: formatDate(transfer.transfer_date),
                        amount: formatCurrency(transfer.amount),
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
