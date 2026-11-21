import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BankEntry } from "@/bindings";
import { logger } from "@/infra/logger";
import { ConfirmationDialog, FAB, ManagerHeader } from "@/ui/components";
import { toastService } from "@/ui/components/snackbar";
import { AddBankTransferModal } from "./add_bank_transfer_form/AddBankTransferModal";
import { BankTransferList } from "./bank_transfer_list/BankTransferList";
import { EditBankTransferModal } from "./edit_bank_transfer_modal/EditBankTransferModal";
import { formatBankManualMatchError } from "./shared/errorPresenter";
import type { BankEntryKind } from "./shared/presenter";
import { useBankEntryManager } from "./useBankEntryManager";
import { useBankTransferOperations } from "./useBankTransferOperations";

interface BankEntryManagerProps {
  kind: BankEntryKind;
}

/**
 * #642 — « Paiements directs » or « Virements de caisse », built like the procedure type
 * page: a full-width list, a (+) opening the add window, a row's pencil the same window
 * in edit mode, its bin a confirmed delete (R5).
 */
export function BankEntryManager({ kind }: BankEntryManagerProps) {
  const { t } = useTranslation("bank");
  const [searchTerm, setSearchTerm] = useState("");
  const { isLoading, error, deleteTransfer } = useBankTransferOperations();
  const { entries, count } = useBankEntryManager(kind, searchTerm);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editing, setEditing] = useState<BankEntry | null>(null);
  const [toDelete, setToDelete] = useState<BankEntry | null>(null);
  const idBase = kind === "fund" ? "fund-wire" : "direct-payment";

  useEffect(() => {
    logger.info("[BankEntryManager] Page mounted", { kind });
  }, [kind]);

  const handleDeleteConfirm = async () => {
    if (!toDelete) return;
    const entry = toDelete;
    setToDelete(null);
    try {
      const result = await deleteTransfer(entry);
      if (result.success) {
        toastService.show("success", t(`transfer.${kind}.deleted`));
      } else {
        const { key, params } = formatBankManualMatchError(result.error);
        toastService.show("error", t(key, params));
      }
    } catch (err) {
      logger.error("[BankEntryManager] Exception deleting entry", { error: err });
      toastService.show("error", t("transfer.error_unknown"));
    }
  };

  return (
    <div className="flex flex-col h-full w-full relative">
      <ManagerHeader
        searchId={`${idBase}-search`}
        title={t(`transfer.${kind}.title`)}
        count={count}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder={t(`transfer.${kind}.search_placeholder`)}
      />
      <div className="flex-1 overflow-auto flex flex-col">
        <BankTransferList
          kind={kind}
          transfers={entries}
          loading={isLoading}
          onEdit={setEditing}
          onDelete={setToDelete}
        />
        {error && (
          <div className="p-4 mt-4 bg-m3-error-container rounded-xl text-m3-on-error-container text-sm">
            {error}
          </div>
        )}
      </div>

      <FAB
        id={`fab-create-${idBase}`}
        onClick={() => setIsAddOpen(true)}
        label={t(`transfer.${kind}.add_title`)}
      />

      <AddBankTransferModal kind={kind} isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} />
      <EditBankTransferModal transfer={editing} onClose={() => setEditing(null)} />

      <ConfirmationDialog
        id={`delete-${idBase}-confirmation`}
        isOpen={toDelete !== null}
        title={t(`transfer.${kind}.delete_title`)}
        message={t(`transfer.${kind}.delete_message`)}
        confirmLabel={t("transfer.delete.confirm")}
        cancelLabel={t("transfer.delete.cancel")}
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
