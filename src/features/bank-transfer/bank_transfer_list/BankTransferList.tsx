import { Edit2, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { BankTransfer } from "@/bindings";
import { logger } from "@/lib/logger";

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-neutral-60">{t("transfer.list.loading")}</p>
      </div>
    );
  }

  if (transfers.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-neutral-60">{t("transfer.list.empty")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full border-r border-neutral-20">
      {/* Header */}
      <div className="grid grid-cols-6 gap-4 p-4 bg-neutral-10 border-b border-neutral-20 font-semibold text-sm sticky top-0">
        <div>{t("transfer.list.columns.date")}</div>
        <div>{t("transfer.list.columns.amount")}</div>
        <div>{t("transfer.list.columns.type")}</div>
        <div>{t("transfer.list.columns.bankAccount")}</div>
        <div>{tCommon("table.actions")}</div>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {transfers.map((transfer) => (
          <div
            key={transfer.id}
            className="grid grid-cols-6 gap-4 p-4 border-b border-neutral-10 hover:bg-neutral-5 items-center text-sm"
          >
            <div>{new Date(transfer.transfer_date).toLocaleDateString("fr-FR")}</div>
            <div>{(transfer.amount / 1000).toFixed(2)}€</div>
            <div className="capitalize">
              {transfer.transfer_type === "FUND"
                ? t("transfer.typeFund")
                : transfer.transfer_type === "CHECK"
                  ? t("transfer.typeCheck")
                  : t("transfer.typeCreditCard")}
            </div>
            <div className="truncate text-neutral-70" title={transfer.bank_account.name}>
              {transfer.bank_account.name}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onEdit(transfer)}
                className="p-1 hover:bg-neutral-20 rounded transition-colors"
                title={tCommon("action.edit")}
              >
                <Edit2 className="size-4 text-primary-60" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(transfer.id)}
                className="p-1 hover:bg-neutral-20 rounded transition-colors"
                title={tCommon("action.delete")}
              >
                <Trash2 className="size-4 text-error-70" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
