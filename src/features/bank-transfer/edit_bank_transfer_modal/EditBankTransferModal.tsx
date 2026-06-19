import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { BankEntry } from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";
import { logger } from "@/infra/logger";
import { Button, DateField, SelectField } from "@/ui/components";
import { FormModal } from "@/ui/components/modal/FormModal";
import { useFormatters } from "@/ui/format/formatters";
import { SelectFundGroupsPanel } from "../select_items_panel/SelectFundGroupsPanel";
import { SelectProceduresPanel } from "../select_items_panel/SelectProceduresPanel";
import { useEditBankTransferModal } from "./useEditBankTransferModal";

/**
 * EditBankTransferModal — Smart Component
 *
 * Self-contained modal for editing a bank transfer:
 * - FUND type: lets user change date and fund group selection (R9)
 * - Direct type: lets user change date and procedure selection (R17)
 * - Currently linked groups/procedures are pre-selected on open (R21)
 * - Amount is computed from selection (R3)
 * - Transfer type is immutable (R4)
 *
 * Logic lives in useEditBankTransferModal.
 */
interface EditBankTransferModalProps {
  transfer: BankEntry | null;
  onClose: () => void;
}

export function EditBankTransferModal({ transfer, onClose }: EditBankTransferModalProps) {
  const { t } = useTranslation("bank");
  const { t: tCommon } = useTranslation("common");
  const { formatCurrency } = useFormatters();

  const bankAccounts = useCacheStore((state) => state.bankAccounts);
  const bankAccountOptions = bankAccounts.map((acc) => ({ value: acc.id, label: acc.name }));

  useEffect(() => {
    logger.info("[EditBankTransferModal] Component mounted");
  }, []);

  const {
    transferDate,
    setTransferDate,
    bankAccount,
    setBankAccount,
    selectedGroupIds,
    selectedProcedureIds,
    totalAmountMillis,
    currentGroups,
    currentProcedures,
    submitting,
    isValid,
    isFund,
    isCash,
    handleFundGroupSelectionChange,
    handleProcedureSelectionChange,
    handleSubmit,
  } = useEditBankTransferModal(transfer, onClose);

  const typeLabel = isFund
    ? t("transfer.type_fund")
    : transfer?.transfer_type === "PATIENT_CHECK"
      ? t("transfer.type_check")
      : transfer?.transfer_type === "PATIENT_CASH"
        ? t("transfer.type_cash")
        : t("transfer.type_credit_card");

  return (
    <FormModal
      id="edit-bank-transfer-modal"
      isOpen={!!transfer}
      onClose={onClose}
      title={t("transfer.edit.title")}
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            {tCommon("action.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            loading={submitting}
            variant="primary"
            className="flex-1"
          >
            {t("transfer.edit.update")}
          </Button>
        </div>
      }
    >
      {/* Transfer Date */}
      <DateField
        id="editTransferDate"
        label={t("transfer.date")}
        value={transferDate}
        onChange={(e) => setTransferDate(e.target.value)}
      />

      {/* Type — display only (R4: immutable) */}
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-neutral-90">{t("transfer.type")}</span>
        <span className="px-3 py-2 bg-m3-surface-container rounded-xl text-sm text-neutral-70">
          {typeLabel}
        </span>
      </div>

      {/* Bank Account — read-only label for CASH (R13: auto-assigned, immutable) */}
      {isCash ? (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-neutral-90">{t("transfer.bank_account")}</span>
          <span className="text-sm text-neutral-60">{t("transfer.cash_account")}</span>
        </div>
      ) : (
        <SelectField
          id="editBankAccount"
          label={t("transfer.bank_account")}
          value={bankAccount}
          onChange={(e) => setBankAccount(e.target.value)}
          options={[{ value: "", label: t("transfer.select_bank_account") }, ...bankAccountOptions]}
          required
        />
      )}

      {/* Selection panel — conditional on type */}
      {isFund ? (
        <SelectFundGroupsPanel
          transferDate={transferDate}
          selectedGroupIds={selectedGroupIds}
          onSelectionChange={handleFundGroupSelectionChange}
          currentGroups={currentGroups}
        />
      ) : (
        <SelectProceduresPanel
          transferDate={transferDate}
          selectedProcedureIds={selectedProcedureIds}
          onSelectionChange={handleProcedureSelectionChange}
          currentProcedures={currentProcedures}
        />
      )}

      {/* Computed amount display */}
      {totalAmountMillis > 0 && (
        <div className="rounded-xl bg-m3-surface-container px-4 py-3 text-sm">
          <span className="text-neutral-60">{t("transfer.computed_amount")}</span>{" "}
          <span className="font-semibold text-neutral-90">{formatCurrency(totalAmountMillis)}</span>
        </div>
      )}
    </FormModal>
  );
}
