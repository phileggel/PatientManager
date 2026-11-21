import { useState } from "react";
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
import { createDirectTransfer, createFundTransfer } from "../gateway";
import {
  type BankEntryFieldErrorKeys,
  bankEntryFieldErrorKeys,
  formatBankManualMatchError,
} from "../shared/errorPresenter";
import type { BankEntryKind } from "../shared/presenter";

/** #642 — the type a new entry starts with: a fund's wire, or a payment by check. */
const INITIAL_TYPE: Record<BankEntryKind, BankEntryType> = {
  fund: "FUND_WIRE",
  direct: "PATIENT_CHECK",
};

/**
 * The add window of one page (#642): a fund wire settles groups, a direct payment
 * procedures. A saved entry resets the form and calls `onSaved` (the window closes).
 */
export function useAddBankTransferForm(kind: BankEntryKind, onSaved?: () => void) {
  const { t } = useTranslation("bank");

  const bankAccounts = useCacheStore((state) => state.bankAccounts);

  const [transferDate, setTransferDateState] = useState<string>("");
  const [transferType, setTransferType] = useState<BankEntryType>(INITIAL_TYPE[kind]);
  const [bankAccount, setBankAccountState] = useState<string>("");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedProcedureIds, setSelectedProcedureIds] = useState<string[]>([]);
  const [totalAmountMillis, setTotalAmountMillis] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  // BSM-023 — the message key under each refused field; the component translates.
  const [fieldErrors, setFieldErrors] = useState<BankEntryFieldErrorKeys>({});

  const isFund = transferType === "FUND_WIRE";

  // BAC-050A — the store holds the user's accounts only: a direct payment asks for none.
  const bankAccountOptions = bankAccounts.map((acc: BankAccount) => ({
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

  // #642 — the payment method of a direct payment; its procedures stay ticked, every
  // method offering the same ones.
  const handleTypeChange = (newType: BankEntryType) => {
    setTransferType(newType);
    // A new type has its own account message.
    setFieldErrors((prev) => ({ transferDate: prev.transferDate }));
    // BSM-026 — a direct payment sends no account: the backend sets it.
    setBankAccountState("");
  };

  const handleFundGroupSelectionChange = (groupIds: string[], totalMillis: number) => {
    setSelectedGroupIds(groupIds);
    setTotalAmountMillis(totalMillis);
  };

  const handleProcedureSelectionChange = (procedureIds: string[], totalMillis: number) => {
    setSelectedProcedureIds(procedureIds);
    setTotalAmountMillis(totalMillis);
  };

  const resetForm = () => {
    setTransferDateState("");
    setTransferType(INITIAL_TYPE[kind]);
    setBankAccountState("");
    setSelectedGroupIds([]);
    setSelectedProcedureIds([]);
    setTotalAmountMillis(0);
    setFieldErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // The form sends what it holds; the backend judges it (BSM-020).
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
        toastService.show("success", t(`transfer.${kind}.added`));
        resetForm();
        onSaved?.();
      } else {
        setFieldErrors(bankEntryFieldErrorKeys(result.error) ?? {});
        const { key, params } = formatBankManualMatchError(result.error);
        toastService.show("error", t(key, params));
      }
    } catch (error) {
      logger.error("[useAddBankTransferForm] Exception", { error });
      toastService.show("error", t("transfer.error_unknown"));
    } finally {
      setSubmitting(false);
    }
  };

  // #642 — something entered: closing asks first.
  const isDirty =
    transferDate !== "" ||
    bankAccount !== "" ||
    transferType !== INITIAL_TYPE[kind] ||
    selectedGroupIds.length > 0 ||
    selectedProcedureIds.length > 0;

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
    isDirty,
    resetForm,
    handleSubmit,
  };
}
