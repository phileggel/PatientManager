import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { BankAccount, BankTransferType } from "@/bindings";
import { useSnackbar } from "@/core/snackbar";
import { useAppStore } from "@/lib/appStore";
import { logger } from "@/lib/logger";
import { createDirectTransfer, createFundTransfer } from "../manual_match/gateway";
import { type BankTransferFormErrors, validateBankTransfer } from "../shared/validateBankTransfer";

export function useAddBankTransferForm() {
  const { t } = useTranslation("bank");
  const { showSnackbar } = useSnackbar();

  const bankAccounts = useAppStore((state) => state.bankAccounts);

  const [transferDate, setTransferDateState] = useState<string>("");
  const [transferType, setTransferType] = useState<BankTransferType>("FUND");
  const [bankAccount, setBankAccountState] = useState<string>("");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedProcedureIds, setSelectedProcedureIds] = useState<string[]>([]);
  const [totalAmountMillis, setTotalAmountMillis] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<BankTransferFormErrors>({});

  const bankAccountOptions = bankAccounts.map((acc: BankAccount) => ({
    value: acc.id,
    label: acc.name,
  }));

  const isFund = transferType === "FUND";
  const hasItems = isFund ? selectedGroupIds.length > 0 : selectedProcedureIds.length > 0;

  const setTransferDate = (value: string) => {
    setTransferDateState(value);
    // Reset selection when date changes
    setSelectedGroupIds([]);
    setSelectedProcedureIds([]);
    setTotalAmountMillis(0);
    if (errors.transferDate) setErrors((prev) => ({ ...prev, transferDate: undefined }));
  };

  const setBankAccount = (value: string) => {
    setBankAccountState(value);
    if (errors.bankAccount) setErrors((prev) => ({ ...prev, bankAccount: undefined }));
  };

  const handleTypeChange = (newType: BankTransferType) => {
    setTransferType(newType);
    setSelectedGroupIds([]);
    setSelectedProcedureIds([]);
    setTotalAmountMillis(0);
    setErrors({});
  };

  const handleFundGroupSelectionChange = (groupIds: string[], totalMillis: number) => {
    setSelectedGroupIds(groupIds);
    setTotalAmountMillis(totalMillis);
    if (errors.noItemsSelected && groupIds.length > 0) {
      setErrors((prev) => ({ ...prev, noItemsSelected: undefined }));
    }
  };

  const handleProcedureSelectionChange = (procedureIds: string[], totalMillis: number) => {
    setSelectedProcedureIds(procedureIds);
    setTotalAmountMillis(totalMillis);
    if (errors.noItemsSelected && procedureIds.length > 0) {
      setErrors((prev) => ({ ...prev, noItemsSelected: undefined }));
    }
  };

  const resetForm = () => {
    setTransferDateState("");
    setTransferType("FUND");
    setBankAccountState("");
    setSelectedGroupIds([]);
    setSelectedProcedureIds([]);
    setTotalAmountMillis(0);
    setErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors = validateBankTransfer(
      { transferDate, bankAccount, hasItems },
      {
        dateRequired: t("transfer.validate.dateRequired"),
        bankAccountRequired: t("transfer.validate.bankAccountRequired"),
        noItemsSelected: t("transfer.validate.noItemsSelected"),
      },
    );
    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      logger.warn("[useAddBankTransferForm] Validation failed", { errors: newErrors });
      return;
    }

    setSubmitting(true);
    try {
      let result: { success: boolean; error?: string };

      if (isFund) {
        result = await createFundTransfer(bankAccount, transferDate, selectedGroupIds);
      } else {
        result = await createDirectTransfer(
          bankAccount,
          transferDate,
          transferType,
          selectedProcedureIds,
        );
      }

      if (result.success) {
        showSnackbar("success", t("transfer.add.success"));
        resetForm();
      } else {
        showSnackbar("error", t("transfer.add.error", { error: result.error }));
      }
    } catch (error) {
      logger.error("[useAddBankTransferForm] Exception", { error });
      showSnackbar("error", t("transfer.add.errorUnknown"));
    } finally {
      setSubmitting(false);
    }
  };

  return {
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
    handleSubmit,
  };
}
