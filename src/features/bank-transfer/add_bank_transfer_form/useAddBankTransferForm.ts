import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BankAccount, BankTransferType } from "@/bindings";
import { useSnackbar } from "@/core/snackbar";
import { useAppStore } from "@/lib/appStore";
import { logger } from "@/lib/logger";
import { createDirectTransfer, createFundTransfer, getCashBankAccountId } from "../gateway";
import { type BankTransferFormErrors, validateBankTransfer } from "../shared/validateBankTransfer";

export function useAddBankTransferForm() {
  const { t } = useTranslation("bank");
  const { showSnackbar } = useSnackbar();

  const bankAccounts = useAppStore((state) => state.bankAccounts);

  const [transferDate, setTransferDateState] = useState<string>("");
  const [transferType, setTransferType] = useState<BankTransferType>("FUND");
  const [bankAccount, setBankAccountState] = useState<string>("");
  const [cashAccountId, setCashAccountId] = useState<string>("");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedProcedureIds, setSelectedProcedureIds] = useState<string[]>([]);
  const [totalAmountMillis, setTotalAmountMillis] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<BankTransferFormErrors>({});

  // Fetch the cash account ID once on mount (R13)
  useEffect(() => {
    getCashBankAccountId().then((result) => {
      if (result.success && result.data) {
        setCashAccountId(result.data);
      } else {
        logger.error("[useAddBankTransferForm] Failed to fetch cash account id", {
          error: result.error,
        });
      }
    });
  }, []);

  // Reactively sync bank account when CASH is selected and cashAccountId is available (R13)
  // Handles the case where cashAccountId loads after the user already selected CASH
  useEffect(() => {
    if (transferType === "CASH" && cashAccountId) {
      setBankAccountState(cashAccountId);
    }
  }, [transferType, cashAccountId]);

  const isFund = transferType === "FUND";
  const isCash = transferType === "CASH";
  const hasItems = isFund ? selectedGroupIds.length > 0 : selectedProcedureIds.length > 0;

  // Exclude the cash account from the regular dropdown once its id is known (R13)
  const bankAccountOptions = bankAccounts
    .filter((acc: BankAccount) => !cashAccountId || acc.id !== cashAccountId)
    .map((acc: BankAccount) => ({
      value: acc.id,
      label: acc.name,
    }));

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
    // Auto-assign cash account for CASH type, clear for others (R13)
    if (newType === "CASH") {
      setBankAccountState(cashAccountId);
    } else {
      setBankAccountState("");
    }
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
    setTransferType("FUND"); // Resetting to FUND prevents the CASH reactive effect from firing
    setBankAccountState("");
    setSelectedGroupIds([]);
    setSelectedProcedureIds([]);
    setTotalAmountMillis(0);
    setErrors({});
    // cashAccountId intentionally preserved — already loaded, no need to refetch
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

  const isValid = !!transferDate && (isCash || !!bankAccount) && hasItems;

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
    isCash,
    isValid,
    handleSubmit,
  };
}
