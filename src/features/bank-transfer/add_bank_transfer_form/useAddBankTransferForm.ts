import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  BankAccount,
  BankEntryType,
  BankManualMatchError,
  BankManualMatchResult,
} from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";
import { logger } from "@/infra/logger";
import type { ServiceResult } from "@/types/api";
import { toastService } from "@/ui/components/snackbar";
import { createDirectTransfer, createFundTransfer, getCashBankAccountId } from "../gateway";
import {
  type BankEntryFieldErrorKeys,
  bankEntryFieldErrorKeys,
  formatBankManualMatchError,
} from "../shared/errorPresenter";

export function useAddBankTransferForm() {
  const { t } = useTranslation("bank");

  const bankAccounts = useCacheStore((state) => state.bankAccounts);

  const [transferDate, setTransferDateState] = useState<string>("");
  const [transferType, setTransferType] = useState<BankEntryType>("FUND_WIRE");
  const [bankAccount, setBankAccountState] = useState<string>("");
  const [cashAccountId, setCashAccountId] = useState<string>("");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedProcedureIds, setSelectedProcedureIds] = useState<string[]>([]);
  const [totalAmountMillis, setTotalAmountMillis] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  // BSM-023 — the message key under each refused field; the component translates.
  const [fieldErrors, setFieldErrors] = useState<BankEntryFieldErrorKeys>({});

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

  const isFund = transferType === "FUND_WIRE";
  const isCash = transferType === "PATIENT_CASH";

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
    setFieldErrors((prev) => ({ ...prev, transferDate: undefined }));
  };

  const setBankAccount = (value: string) => {
    setBankAccountState(value);
    setFieldErrors((prev) => ({ ...prev, bankAccount: undefined }));
  };

  const handleTypeChange = (newType: BankEntryType) => {
    setTransferType(newType);
    setSelectedGroupIds([]);
    setSelectedProcedureIds([]);
    setTotalAmountMillis(0);
    // BSM-025 — a new type has its own account and selection.
    setFieldErrors((prev) => ({ transferDate: prev.transferDate }));
    // R13 — a cash payment sends no account: the backend sets it (BSM-026).
    setBankAccountState("");
  };

  const handleFundGroupSelectionChange = (groupIds: string[], totalMillis: number) => {
    setSelectedGroupIds(groupIds);
    setTotalAmountMillis(totalMillis);
    setFieldErrors((prev) => ({ ...prev, selection: undefined }));
  };

  const handleProcedureSelectionChange = (procedureIds: string[], totalMillis: number) => {
    setSelectedProcedureIds(procedureIds);
    setTotalAmountMillis(totalMillis);
    setFieldErrors((prev) => ({ ...prev, selection: undefined }));
  };

  const resetForm = () => {
    setTransferDateState("");
    setTransferType("FUND_WIRE");
    setBankAccountState("");
    setSelectedGroupIds([]);
    setSelectedProcedureIds([]);
    setTotalAmountMillis(0);
    setFieldErrors({});
    // cashAccountId intentionally preserved — already loaded, no need to refetch
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // BSM-022 — the form sends what it holds; the backend judges it (BSM-020).
    setFieldErrors({});

    setSubmitting(true);
    try {
      let result: ServiceResult<BankManualMatchResult, BankManualMatchError>;

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
        toastService.show("success", t("transfer.add.success"));
        resetForm();
      } else {
        setFieldErrors(bankEntryFieldErrorKeys(result.error) ?? {});
        const { key, params } = formatBankManualMatchError(result.error);
        toastService.show("error", t(key, params));
      }
    } catch (error) {
      logger.error("[useAddBankTransferForm] Exception", { error });
      toastService.show("error", t("transfer.add.error_unknown"));
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
    fieldErrors,
    bankAccountOptions,
    isFund,
    isCash,
    handleSubmit,
  };
}
