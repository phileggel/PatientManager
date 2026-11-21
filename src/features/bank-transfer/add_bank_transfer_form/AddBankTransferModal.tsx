import { BankEntryFormModal } from "../shared/BankEntryFormModal";
import type { BankEntryKind } from "../shared/presenter";
import { useAddBankTransferForm } from "./useAddBankTransferForm";

interface AddBankTransferModalProps {
  kind: BankEntryKind;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * #642 — the (+) window of a page: a direct payment ticks procedures (R14), a fund wire
 * its groups (R6); the amount is the selection's (R3). Abandoned or saved, it starts
 * empty next time.
 */
export function AddBankTransferModal({ kind, isOpen, onClose }: AddBankTransferModalProps) {
  const form = useAddBankTransferForm(kind, onClose);

  return (
    <BankEntryFormModal
      id={kind === "fund" ? "fund-wire-add" : "direct-payment-add"}
      kind={kind}
      mode="add"
      isOpen={isOpen}
      onClose={() => {
        form.resetForm();
        onClose();
      }}
      isDirty={form.isDirty}
      transferDate={form.transferDate}
      onDateChange={form.setTransferDate}
      transferType={form.transferType}
      onTypeChange={form.handleTypeChange}
      bankAccount={form.bankAccount}
      bankAccountOptions={form.bankAccountOptions}
      onBankAccountChange={form.setBankAccount}
      selectedGroupIds={form.selectedGroupIds}
      selectedProcedureIds={form.selectedProcedureIds}
      onGroupsChange={form.handleFundGroupSelectionChange}
      onProceduresChange={form.handleProcedureSelectionChange}
      totalAmountMillis={form.totalAmountMillis}
      fieldErrors={form.fieldErrors}
      submitting={form.submitting}
      onSubmit={form.handleSubmit}
    />
  );
}
