import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BankAccount, BankTransfer } from "@/bindings";
import { useSnackbar } from "@/core/snackbar";
import { useAppStore } from "@/lib/appStore";
import { logger } from "@/lib/logger";
import { Button, DatePickerLegacy, SelectField } from "@/ui/components";
import {
  getTransferFundGroupIds,
  getTransferProcedureIds,
  updateDirectTransfer,
  updateFundTransfer,
} from "../manual_match/gateway";
import { SelectFundGroupsPanel } from "../manual_match/SelectFundGroupsPanel";
import { SelectProceduresPanel } from "../manual_match/SelectProceduresPanel";

/**
 * EditBankTransferModal — Smart Component
 *
 * Self-contained modal for editing a bank transfer:
 * - FUND type: lets user change date and fund group selection (R9)
 * - Direct type: lets user change date and procedure selection (R17)
 * - Amount is computed from selection (R3)
 * - Transfer type is immutable (R4)
 */
interface EditBankTransferModalProps {
  transfer: BankTransfer | null;
  onClose: () => void;
}

export function EditBankTransferModal({ transfer, onClose }: EditBankTransferModalProps) {
  const { t } = useTranslation("bank");
  const { t: tCommon } = useTranslation("common");
  const { showSnackbar } = useSnackbar();

  const bankAccounts = useAppStore((state) => state.bankAccounts);
  const bankAccountOptions = bankAccounts.map((acc: BankAccount) => ({
    value: acc.id,
    label: acc.name,
  }));

  const [isOpen, setIsOpen] = useState(false);
  const [transferDate, setTransferDate] = useState<string>("");
  const [bankAccount, setBankAccount] = useState<string>("");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedProcedureIds, setSelectedProcedureIds] = useState<string[]>([]);
  const [totalAmountMillis, setTotalAmountMillis] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    logger.info("[EditBankTransferModal] Component mounted");
  }, []);

  // Open modal and load initial linked ids
  useEffect(() => {
    if (!transfer) return;

    setIsOpen(true);
    setTransferDate(transfer.transfer_date);
    setBankAccount(transfer.bank_account.id);
    setSelectedGroupIds([]);
    setSelectedProcedureIds([]);
    setTotalAmountMillis(transfer.amount);

    const loadLinks = async () => {
      if (transfer.transfer_type === "FUND") {
        const result = await getTransferFundGroupIds(transfer.id);
        if (result.success && result.data) setSelectedGroupIds(result.data);
        else logger.error("[EditBankTransferModal] Failed to load fund group ids", result.error);
      } else {
        const result = await getTransferProcedureIds(transfer.id);
        if (result.success && result.data) setSelectedProcedureIds(result.data);
        else logger.error("[EditBankTransferModal] Failed to load procedure ids", result.error);
      }
    };

    loadLinks();
  }, [transfer]);

  const handleClose = () => {
    setIsOpen(false);
    onClose();
  };

  const isFund = transfer?.transfer_type === "FUND";

  const handleFundGroupSelectionChange = (groupIds: string[], totalMillis: number) => {
    setSelectedGroupIds(groupIds);
    setTotalAmountMillis(totalMillis);
  };

  const handleProcedureSelectionChange = (procedureIds: string[], totalMillis: number) => {
    setSelectedProcedureIds(procedureIds);
    setTotalAmountMillis(totalMillis);
  };

  const isValid =
    transferDate.trim() !== "" &&
    bankAccount.trim() !== "" &&
    (isFund ? selectedGroupIds.length > 0 : selectedProcedureIds.length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!transfer || !isValid) {
      showSnackbar("error", t("transfer.edit.errorInvalidForm"));
      return;
    }

    setSubmitting(true);
    try {
      let result: { success: boolean; error?: string };

      if (isFund) {
        result = await updateFundTransfer(transfer.id, transferDate, selectedGroupIds);
      } else {
        result = await updateDirectTransfer(transfer.id, transferDate, selectedProcedureIds);
      }

      if (result.success) {
        showSnackbar("success", t("transfer.edit.success"));
        handleClose();
      } else {
        showSnackbar("error", result.error ?? t("transfer.edit.error"));
      }
    } catch (error) {
      logger.error("[EditBankTransferModal] Exception", { error });
      showSnackbar("error", t("transfer.edit.errorUnknown"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !transfer) return null;

  const typeLabel = isFund
    ? t("transfer.typeFund")
    : transfer.transfer_type === "CHECK"
      ? t("transfer.typeCheck")
      : t("transfer.typeCreditCard");

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-20">
          <h2 className="text-lg font-semibold">{t("transfer.edit.title")}</h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 hover:bg-neutral-10 rounded transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-6 flex-1 p-6 overflow-y-auto">
          {/* Transfer Date */}
          <DatePickerLegacy
            id="editTransferDate"
            label={t("transfer.date")}
            value={transferDate}
            onChange={(e) => setTransferDate(e.target.value)}
            required
          />

          {/* Type — display only (R4: immutable) */}
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-90">{t("transfer.type")}</span>
            <span className="px-3 py-2 border border-neutral-20 rounded-md bg-neutral-10 text-sm text-neutral-70">
              {typeLabel}
            </span>
          </div>

          {/* Bank Account */}
          <SelectField
            id="editBankAccount"
            label={t("transfer.bankAccount")}
            value={bankAccount}
            onChange={(e) => setBankAccount(e.target.value)}
            options={[{ value: "", label: t("transfer.selectBankAccount") }, ...bankAccountOptions]}
            required
          />

          {/* Selection panel — conditional on type */}
          {isFund ? (
            <SelectFundGroupsPanel
              transferDate={transferDate}
              selectedGroupIds={selectedGroupIds}
              onSelectionChange={handleFundGroupSelectionChange}
            />
          ) : (
            <SelectProceduresPanel
              transferDate={transferDate}
              selectedProcedureIds={selectedProcedureIds}
              onSelectionChange={handleProcedureSelectionChange}
            />
          )}

          {/* Computed amount display */}
          {totalAmountMillis > 0 && (
            <div className="rounded-md bg-neutral-10 border border-neutral-20 px-4 py-3 text-sm">
              <span className="text-neutral-60">{t("transfer.computedAmount")}</span>{" "}
              <span className="font-semibold text-neutral-90">
                €{(totalAmountMillis / 1000).toFixed(2)}
              </span>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-neutral-20">
          <Button variant="secondary" onClick={handleClose} className="flex-1">
            {tCommon("action.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            loading={submitting}
            className="flex-1"
          >
            {t("transfer.edit.update")}
          </Button>
        </div>
      </div>
    </div>
  );
}
