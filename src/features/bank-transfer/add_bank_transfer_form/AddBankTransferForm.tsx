import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { BankTransferType } from "@/bindings";
import { logger } from "@/lib/logger";
import { Button, DateField, SelectField, TextField } from "@/ui/components";
import { SelectFundModal } from "./SelectFundModal";
import { SelectPatientModal } from "./SelectPatientModal";
import { useAddBankTransferForm } from "./useAddBankTransferForm";

/**
 * AddBankTransferForm - Smart Component
 *
 * Fully self-contained:
 * - Gets funds and patients from global store
 * - Uses useAddBankTransferForm hook for all logic
 * - Auto-fills source based on type selection
 * - Creates transfer via gateway
 * - Emits success event for parent to refresh
 * - Handles errors via snackbar
 *
 * No props needed - it's completely independent
 */
export function AddBankTransferForm() {
  const { t } = useTranslation("bank");

  useEffect(() => {
    logger.info("[AddBankTransferForm] Component mounted");
  }, []);

  const {
    // Form state
    transferDate,
    setTransferDate,
    amount,
    setAmount,
    transferType,
    handleTypeChange,
    bankAccount,
    setBankAccount,
    submitting,
    errors,
    bankAccountOptions,
    // Modal state
    showFundModal,
    setShowFundModal,
    showPatientModal,
    setShowPatientModal,
    selectedFund,
    selectedPatient,
    // Handlers
    handleFundSelected,
    handlePatientSelected,
    handleSubmit,
  } = useAddBankTransferForm();

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {/* Transfer Date */}
      <DateField
        id="transferDate"
        label={t("transfer.date")}
        value={transferDate}
        onChange={(e) => setTransferDate(e.target.value)}
        error={errors.transferDate}
      />

      {/* Amount */}
      <TextField
        id="amount"
        label={t("transfer.amount")}
        type="number"
        step="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0.00"
        error={errors.amount}
      />

      {/* Type */}
      <SelectField
        id="type"
        label={t("transfer.type")}
        value={transferType}
        onChange={(e) => handleTypeChange(e.target.value as BankTransferType)}
        options={[
          { value: "", label: t("transfer.selectType") },
          { value: "FUND", label: t("transfer.typeFund") },
          { value: "CHECK", label: t("transfer.typeCheck") },
          { value: "CREDIT_CARD", label: t("transfer.typeCreditCard") },
        ]}
      />

      {/* Fund/Patient Selection */}
      {transferType === "FUND" && (
        <div className="flex flex-col gap-2">
          <div className="px-4 py-3 bg-m3-surface rounded-lg border border-m3-outline flex items-center justify-between">
            <span className="text-sm font-medium text-m3-on-surface">
              {selectedFund
                ? t("transfer.selectedFund", { name: selectedFund.name })
                : t("transfer.noFund")}
            </span>
            <Button
              type="button"
              variant="secondary"
              disabled={submitting}
              onClick={() => setShowFundModal(true)}
              className="flex-shrink-0"
            >
              {selectedFund ? t("transfer.changeFund") : t("transfer.selectFund")}
            </Button>
          </div>
        </div>
      )}

      {(transferType === "CHECK" || transferType === "CREDIT_CARD") && (
        <div className="flex flex-col gap-2">
          <div className="px-4 py-3 bg-m3-surface rounded-lg border border-m3-outline flex items-center justify-between">
            <span className="text-sm font-medium text-m3-on-surface">
              {selectedPatient
                ? t("transfer.selectedPatient", { name: selectedPatient.name })
                : t("transfer.noPatient")}
            </span>
            <Button
              type="button"
              variant="secondary"
              disabled={submitting}
              onClick={() => setShowPatientModal(true)}
              className="flex-shrink-0"
            >
              {selectedPatient ? t("transfer.changePatient") : t("transfer.selectPatient")}
            </Button>
          </div>
        </div>
      )}

      {/* Bank Account */}
      <SelectField
        id="bankAccount"
        label={t("transfer.bankAccount")}
        value={bankAccount}
        onChange={(e) => setBankAccount(e.target.value)}
        options={[{ value: "", label: t("transfer.selectBankAccount") }, ...bankAccountOptions]}
        error={errors.bankAccount}
      />

      <Button type="submit" variant="primary" loading={submitting} disabled={submitting}>
        {submitting ? t("transfer.creating") : t("transfer.createButton")}
      </Button>

      {/* Select Fund Modal */}
      <SelectFundModal
        isOpen={showFundModal}
        onSelect={handleFundSelected}
        onCancel={() => setShowFundModal(false)}
      />

      {/* Select Patient Modal */}
      <SelectPatientModal
        isOpen={showPatientModal}
        onSelect={handlePatientSelected}
        onCancel={() => setShowPatientModal(false)}
      />
    </form>
  );
}
