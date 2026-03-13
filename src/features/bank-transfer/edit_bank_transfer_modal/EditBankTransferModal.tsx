import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BankAccount, BankTransfer, BankTransferType } from "@/bindings";
import { useSnackbar } from "@/core/snackbar";
import { useAppStore } from "@/lib/appStore";
import { logger } from "@/lib/logger";
import {
  Button,
  DatePickerLegacy,
  SelectField,
  SelectFieldLegacy,
  TextField,
} from "@/ui/components";
import { updateBankTransfer } from "../gateway";

/**
 * EditBankTransferModal - Smart Component
 *
 * Self-contained with lifecycle callback:
 * - Gets bank accounts from global store
 * - Manages modal open/close state internally
 * - Shows snackbar feedback directly
 * - Backend events via useAppInit handle data refresh automatically
 */
interface EditBankTransferModalProps {
  transfer: BankTransfer | null;
  onClose: () => void;
}

export function EditBankTransferModal({ transfer, onClose }: EditBankTransferModalProps) {
  const { t } = useTranslation("bank");
  const { t: tCommon } = useTranslation("common");
  const { showSnackbar } = useSnackbar();
  // Get bank accounts from store
  const bankAccounts = useAppStore((state) => state.bankAccounts);
  const bankAccountOptions = bankAccounts.map((acc: BankAccount) => ({
    value: acc.id,
    label: acc.name,
  }));

  // Modal state
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    logger.info("[EditBankTransferModal] Component mounted");
  }, []);

  // Form state
  const [transferDate, setTransferDate] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [transferType, setTransferType] = useState<BankTransferType>("FUND");
  const [bankAccount, setBankAccount] = useState<string>("");
  const [source, setSource] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Show/hide modal when transfer changes
  useEffect(() => {
    if (transfer) {
      setIsOpen(true);
      setTransferDate(transfer.transfer_date);
      setAmount((transfer.amount / 1000).toString());
      setTransferType(transfer.transfer_type);
      setBankAccount(transfer.bank_account.id); // Store only the ID string
      setSource(transfer.source);
    }
  }, [transfer]);

  const handleClose = () => {
    setIsOpen(false);
    onClose();
  };

  const isValid =
    transferDate &&
    amount &&
    parseFloat(amount) > 0 &&
    typeof bankAccount === "string" &&
    bankAccount.trim() !== "" &&
    source.trim() !== "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!transfer || !isValid) {
      showSnackbar("error", t("transfer.edit.errorInvalidForm"));
      return;
    }

    const selectedAccount = bankAccounts.find((acc) => acc.id === bankAccount);
    if (!selectedAccount) {
      showSnackbar("error", t("transfer.edit.errorInvalidAccount"));
      return;
    }

    setSubmitting(true);
    try {
      const result = await updateBankTransfer({
        ...transfer,
        transfer_date: transferDate,
        amount: Math.round(parseFloat(amount) * 1000),
        transfer_type: transferType,
        bank_account: selectedAccount, // Send the full object as required by bindings
        source,
      });

      if (result.success) {
        showSnackbar("success", t("transfer.edit.success"));
        handleClose();
        // Backend event will trigger useAppInit to refresh data
      } else {
        showSnackbar("error", result.error || t("transfer.edit.error"));
      }
    } catch (error) {
      logger.error("Exception updating transfer", { error });
      showSnackbar("error", t("transfer.edit.errorUnknown"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

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
            label="Transfer Date *"
            value={transferDate}
            onChange={(e) => setTransferDate(e.target.value)}
            required
          />

          {/* Amount */}
          <TextField
            id="editAmount"
            label="Amount *"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />

          {/* Type */}
          <SelectFieldLegacy
            id="editType"
            label={t("transfer.type")}
            value={transferType}
            onChange={(e) => setTransferType(e.target.value as BankTransferType)}
            required
          >
            <option value="">{t("transfer.selectType")}</option>
            <option value="FUND">{t("transfer.typeFund")}</option>
            <option value="CHECK">{t("transfer.typeCheck")}</option>
            <option value="CREDIT_CARD">{t("transfer.typeCreditCard")}</option>
          </SelectFieldLegacy>

          {/* Bank Account */}
          <SelectField
            id="editBankAccount"
            label="Bank Account *"
            value={bankAccount}
            onChange={(e) => setBankAccount(e.target.value)}
            options={[{ value: "", label: t("transfer.selectBankAccount") }, ...bankAccountOptions]}
            required
          />

          {/* Source */}
          <div className="flex flex-col gap-2">
            <TextField
              id="editSource"
              label="Source *"
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              required
            />
            <p className="text-xs text-m3-on-surface-variant">{t("transfer.edit.sourceHint")}</p>
          </div>
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
