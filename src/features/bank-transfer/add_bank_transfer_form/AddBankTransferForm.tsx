import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { BankTransferType } from "@/bindings";
import { logger } from "@/lib/logger";
import { Button, DateField, SelectField } from "@/ui/components";
import { SelectFundGroupsPanel } from "../select_items_panel/SelectFundGroupsPanel";
import { SelectProceduresPanel } from "../select_items_panel/SelectProceduresPanel";
import { useAddBankTransferForm } from "./useAddBankTransferForm";

/**
 * AddBankTransferForm — Smart Component
 *
 * Fully self-contained:
 * - Gets bank accounts from global store
 * - Uses useAddBankTransferForm hook for all logic
 * - For FUND type: lets user select fund payment groups (R6)
 * - For direct types: lets user select procedures (R14)
 * - Amount is computed from selection (R3)
 * - Calls createFundTransfer or createDirectTransfer (R7 / R15)
 */
export function AddBankTransferForm() {
  const { t } = useTranslation("bank");

  useEffect(() => {
    logger.info("[AddBankTransferForm] Component mounted");
  }, []);

  const {
    transferDate,
    setTransferDate,
    transferType,
    handleTypeChange,
    bankAccount,
    setBankAccount,
    selectedGroupIds,
    selectedProcedureIds,
    totalAmountMillis,
    handleFundGroupSelectionChange,
    handleProcedureSelectionChange,
    submitting,
    errors,
    bankAccountOptions,
    isFund,
    isCash,
    isValid,
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

      {/* Type */}
      <SelectField
        id="type"
        label={t("transfer.type")}
        value={transferType}
        onChange={(e) => handleTypeChange(e.target.value as BankTransferType)}
        options={[
          { value: "FUND", label: t("transfer.typeFund") },
          { value: "CHECK", label: t("transfer.typeCheck") },
          { value: "CREDIT_CARD", label: t("transfer.typeCreditCard") },
          { value: "CASH", label: t("transfer.typeCash") },
        ]}
      />

      {/* Bank Account — hidden for CASH (auto-assigned, R13) */}
      {isCash ? (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-neutral-90">{t("transfer.bankAccount")}</span>
          <span className="text-sm text-neutral-60">{t("transfer.cashAccount")}</span>
        </div>
      ) : (
        <SelectField
          id="bankAccount"
          label={t("transfer.bankAccount")}
          value={bankAccount}
          onChange={(e) => setBankAccount(e.target.value)}
          options={[{ value: "", label: t("transfer.selectBankAccount") }, ...bankAccountOptions]}
          error={errors.bankAccount}
        />
      )}

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

      {/* Items validation error */}
      {errors.noItemsSelected && <p className="text-sm text-m3-error">{errors.noItemsSelected}</p>}

      {/* Computed amount display */}
      {totalAmountMillis > 0 && (
        <div className="rounded-md bg-neutral-10 border border-neutral-20 px-4 py-3 text-sm">
          <span className="text-neutral-60">{t("transfer.computedAmount")}</span>{" "}
          <span className="font-semibold text-neutral-90">
            €{(totalAmountMillis / 1000).toFixed(2)}
          </span>
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        loading={submitting}
        disabled={!isValid || submitting}
      >
        {submitting ? t("transfer.creating") : t("transfer.createButton")}
      </Button>
    </form>
  );
}
