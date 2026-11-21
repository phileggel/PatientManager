import { Edit2, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { BankEntry } from "@/bindings";
import { logger } from "@/infra/logger";
import { IconButton } from "@/ui/components";
import { useFormatters } from "@/ui/format/formatters";
import { type BankEntryKind, paymentMethodKey } from "../shared/presenter";

const TAG = "[BankTransferList]";

interface BankTransferListProps {
  /** #642 — the page's kind: direct payments show their method, fund wires their account. */
  kind: BankEntryKind;
  transfers: BankEntry[];
  loading: boolean;
  onEdit: (transfer: BankEntry) => void;
  onDelete: (transfer: BankEntry) => void;
}

export function BankTransferList({
  kind,
  transfers,
  loading,
  onEdit,
  onDelete,
}: BankTransferListProps) {
  const { t } = useTranslation("bank");
  const { t: tCommon } = useTranslation("common");
  const { formatCurrency, formatDate } = useFormatters();

  useEffect(() => {
    logger.info(TAG, "Component mounted");
  }, []);

  const isFund = kind === "fund";
  const idBase = isFund ? "fund-wire" : "direct-payment";

  return (
    <div id={`${idBase}-list`} className="m3-table-container flex-1">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-m3-surface-container z-10">
          <tr>
            <th className="m3-th">{t("transfer.list.columns.date")}</th>
            <th className="m3-th text-right">{t("transfer.list.columns.amount")}</th>
            <th className="m3-th">
              {isFund
                ? t("transfer.list.columns.bank_account")
                : t("transfer.list.columns.payment_method")}
            </th>
            <th className="m3-th text-right">{tCommon("table.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={4} className="m3-td text-center py-12">
                <span className="text-m3-on-surface-variant animate-pulse">
                  {t("transfer.list.loading")}
                </span>
              </td>
            </tr>
          ) : transfers.length === 0 ? (
            <tr>
              <td colSpan={4} className="m3-td text-center py-12 text-m3-on-surface-variant">
                {t(`transfer.${kind}.empty`)}
              </td>
            </tr>
          ) : (
            transfers.map((transfer) => {
              const methodKey = paymentMethodKey(transfer.transfer_type);
              const labelParams = {
                date: formatDate(transfer.transfer_date),
                amount: formatCurrency(transfer.amount),
              };
              return (
                <tr key={transfer.id} id={`${idBase}-row-${transfer.id}`} className="m3-tr">
                  <td className="m3-td text-m3-on-surface">{formatDate(transfer.transfer_date)}</td>
                  <td className="m3-td text-m3-on-surface font-semibold text-right">
                    {formatCurrency(transfer.amount)}
                  </td>
                  {isFund ? (
                    <td
                      className="m3-td text-m3-on-surface-variant truncate max-w-[160px]"
                      title={transfer.bank_account.name}
                    >
                      {transfer.bank_account.name}
                    </td>
                  ) : (
                    <td className="m3-td text-m3-on-surface">{methodKey ? t(methodKey) : "—"}</td>
                  )}
                  <td className="m3-td text-right">
                    <div className="flex items-center justify-end gap-1">
                      <IconButton
                        id={`${idBase}-edit-${transfer.id}`}
                        variant="ghost"
                        size="sm"
                        shape="round"
                        aria-label={t(`transfer.${kind}.edit_aria_label`, labelParams)}
                        icon={<Edit2 size={16} />}
                        onClick={() => onEdit(transfer)}
                      />
                      <IconButton
                        id={`${idBase}-delete-${transfer.id}`}
                        variant="danger"
                        size="sm"
                        shape="round"
                        aria-label={t(`transfer.${kind}.delete_aria_label`, labelParams)}
                        icon={<Trash2 size={16} />}
                        onClick={() => onDelete(transfer)}
                      />
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
