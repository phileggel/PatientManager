import type { BankEntry } from "@/bindings";
import { BankEntryFormModal } from "../shared/BankEntryFormModal";
import { useEditBankTransferModal } from "./useEditBankTransferModal";

interface EditBankTransferModalProps {
  transfer: BankEntry | null;
  onClose: () => void;
}

/**
 * #642 — the add window in edit mode, opened from a row's pencil: the date and the
 * selection change (R9, R17), pre-filled (R21); the method and the account are shown,
 * never changed (R4, BSM-033). Logic lives in useEditBankTransferModal.
 */
export function EditBankTransferModal({ transfer, onClose }: EditBankTransferModalProps) {
  const form = useEditBankTransferModal(transfer, onClose);
  const kind = form.isFund ? "fund" : "direct";

  return (
    <BankEntryFormModal
      id={form.isFund ? "fund-wire-edit" : "direct-payment-edit"}
      kind={kind}
      mode="edit"
      isOpen={transfer !== null}
      onClose={onClose}
      isDirty={form.isDirty}
      transferDate={form.transferDate}
      onDateChange={form.setTransferDate}
      transferType={transfer?.transfer_type ?? "PATIENT_CHECK"}
      bankAccount={transfer?.bank_account.id ?? ""}
      bankAccountOptions={
        transfer ? [{ value: transfer.bank_account.id, label: transfer.bank_account.name }] : []
      }
      selectedGroupIds={form.selectedGroupIds}
      selectedProcedureIds={form.selectedProcedureIds}
      currentGroups={form.currentGroups}
      currentProcedures={form.currentProcedures}
      onGroupsChange={form.handleFundGroupSelectionChange}
      onProceduresChange={form.handleProcedureSelectionChange}
      totalAmountMillis={form.totalAmountMillis}
      fieldErrors={form.fieldErrors}
      submitting={form.submitting}
      onSubmit={form.handleSubmit}
    />
  );
}
