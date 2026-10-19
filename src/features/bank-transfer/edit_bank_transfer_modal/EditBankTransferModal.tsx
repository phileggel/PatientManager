import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { BankEntry } from "@/bindings";
import { logger } from "@/infra/logger";
import { Button, DateField } from "@/ui/components";
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

  useEffect(() => {
    logger.info("[EditBankTransferModal] Component mounted");
  }, []);

  const {
    transferDate,
    setTransferDate,
    selectedGroupIds,
    selectedProcedureIds,
    totalAmountMillis,
    currentGroups,
    currentProcedures,
    submitting,
    fieldErrors,
    isFund,
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
            disabled={submitting}
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
        error={fieldErrors.transferDate && t(fieldErrors.transferDate)}
      />

      {/* Type — display only (R4: immutable) */}
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-neutral-90">
          {t("transfer.list.columns.type")}
        </span>
        <span className="px-3 py-2 bg-m3-surface-container rounded-xl text-sm text-neutral-70">
          {typeLabel}
        </span>
      </div>

      {/* Bank Account — shown, not edited (BSM-033, R9, R17) */}
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-neutral-90">
          {t("transfer.list.columns.bank_account")}
        </span>
        <span
          id="edit-bank-transfer-account"
          className="px-3 py-2 bg-m3-surface-container rounded-xl text-sm text-neutral-70"
        >
          {transfer?.transfer_type === "PATIENT_CASH"
            ? t("transfer.cash_account")
            : transfer?.bank_account.name}
        </span>
      </div>

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

      {/* BSM-023 — the selection's refusal, below both lists */}
      {fieldErrors.selection && (
        <p
          id="edit-bank-transfer-selection-error"
          role="alert"
          className="text-xs text-m3-error -mt-3 ml-1"
        >
          {t(fieldErrors.selection)}
        </p>
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
