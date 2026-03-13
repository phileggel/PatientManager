import { Send } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BankTransfer } from "@/bindings";
import { toastService } from "@/core/snackbar";
import { logger } from "@/lib/logger";
import { ConfirmationDialog, ManagerLayout } from "@/ui/components";
import { AddBankTransferForm } from "./add_bank_transfer_form/AddBankTransferForm";
import { BankTransferList } from "./bank_transfer_list/BankTransferList";
import { EditBankTransferModal } from "./edit_bank_transfer_modal/EditBankTransferModal";
import { deleteBankTransfer } from "./gateway";
import { useBankTransferManager } from "./useBankTransferManager";
import { useBankTransferOperations } from "./useBankTransferOperations";

export default function BankTransferManager() {
  const { t } = useTranslation("bank");
  const { count } = useBankTransferManager();
  const { transfers, isLoading, error } = useBankTransferOperations();
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    logger.info("[BankTransferManager] Page mounted");
  }, []);

  // Edit modal state
  const [editingTransfer, setEditingTransfer] = useState<BankTransfer | null>(null);

  // Delete confirmation state
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [transferToDelete, setTransferToDelete] = useState<string | null>(null);

  const handleEdit = (transfer: BankTransfer) => {
    setEditingTransfer(transfer);
  };

  const handleDelete = (id: string) => {
    setTransferToDelete(id);
    setDeleteConfirmationOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!transferToDelete) return;

    setDeleteConfirmationOpen(false);
    const id = transferToDelete;
    setTransferToDelete(null);

    try {
      const result = await deleteBankTransfer(id);
      if (result.success) {
        toastService.show("success", t("transfer.manager.success.deleted"));
      } else {
        toastService.show("error", result.error || t("transfer.manager.error.delete"));
      }
    } catch (err) {
      logger.error("Exception deleting transfer", { error: err });
      toastService.show("error", String(err));
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmationOpen(false);
    setTransferToDelete(null);
  };

  return (
    <>
      <ManagerLayout
        searchId="bank-transfer-search"
        title={t("transfer.manager.title")}
        count={count}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder={t("transfer.manager.searchPlaceholder")}
        table={
          <div className="flex flex-col h-full">
            <BankTransferList
              transfers={transfers}
              loading={isLoading}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
            {error && (
              <div className="p-4 mt-4 bg-error-20 border border-error-30 rounded text-error-70 text-sm">
                {error}
              </div>
            )}
          </div>
        }
        sidePanelTitle={t("transfer.manager.panelTitle")}
        sidePanelIcon={<Send size={24} strokeWidth={2.5} />}
        sidePanelDescription={t("transfer.manager.panelDescription")}
        sidePanelContent={<AddBankTransferForm />}
      />

      {/* Edit Modal */}
      <EditBankTransferModal transfer={editingTransfer} onClose={() => setEditingTransfer(null)} />

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={deleteConfirmationOpen}
        title={t("transfer.manager.delete.title")}
        message={t("transfer.manager.delete.message")}
        confirmLabel={t("transfer.manager.delete.confirm")}
        cancelLabel={t("transfer.manager.delete.cancel")}
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </>
  );
}
