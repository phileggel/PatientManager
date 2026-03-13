import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AffiliatedFund, BankAccount, BankTransferType, Patient } from "@/bindings";
import { useSnackbar } from "@/core/snackbar";
import { useAppStore } from "@/lib/appStore";
import { logger } from "@/lib/logger";
import { createBankTransfer } from "../gateway";
import { type BankTransferFormErrors, validateBankTransfer } from "../shared/validateBankTransfer";

export function useAddBankTransferForm() {
  const { t } = useTranslation("bank");
  const { showSnackbar } = useSnackbar();

  // Get bank accounts from store
  const bankAccounts = useAppStore((state) => state.bankAccounts);

  // Form state
  const [transferDate, setTransferDateState] = useState<string>("");
  const [amount, setAmountState] = useState<string>("");
  const [transferType, setTransferType] = useState<BankTransferType>("FUND");
  const [bankAccount, setBankAccountState] = useState<string>("");
  const [source, setSource] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<BankTransferFormErrors>({});

  // Modal state
  const [showFundModal, setShowFundModal] = useState(false);
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [selectedFund, setSelectedFund] = useState<AffiliatedFund | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  // Return bank accounts for form
  const bankAccountOptions = bankAccounts.map((acc: BankAccount) => ({
    value: acc.id,
    label: acc.name,
  }));

  // Auto-fill source based on transfer type
  useEffect(() => {
    if (transferType === "FUND" && selectedFund) {
      setSource(`fund_${selectedFund.id}`);
    } else if ((transferType === "CHECK" || transferType === "CREDIT_CARD") && selectedPatient) {
      setSource(`patient_${selectedPatient.id}`);
    }
  }, [transferType, selectedFund, selectedPatient]);

  // Field change handlers with automatic error clearing
  const setTransferDate = (value: string) => {
    setTransferDateState(value);
    if (errors.transferDate) {
      setErrors((prev) => ({ ...prev, transferDate: undefined }));
    }
  };

  const setAmount = (value: string) => {
    setAmountState(value);
    if (errors.amount) {
      setErrors((prev) => ({ ...prev, amount: undefined }));
    }
  };

  const setBankAccount = (value: string) => {
    setBankAccountState(value);
    if (errors.bankAccount) {
      setErrors((prev) => ({ ...prev, bankAccount: undefined }));
    }
  };

  const handleTypeChange = (newType: BankTransferType) => {
    setTransferType(newType);
    // Reset selections when type changes
    if (newType !== "FUND") {
      setSelectedFund(null);
    }
    if (newType === "FUND") {
      setSelectedPatient(null);
    }
    // Clear error when type changes
    setErrors((prev) => ({ ...prev }));
  };

  const handleFundSelected = (fund: AffiliatedFund) => {
    setSelectedFund(fund);
    setShowFundModal(false);
    // Clear source error when fund is selected
    setErrors((prev) => ({ ...prev, source: undefined }));
  };

  const handlePatientSelected = (patient: Patient) => {
    setSelectedPatient(patient);
    setShowPatientModal(false);
    // Clear source error when patient is selected
    setErrors((prev) => ({ ...prev, source: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form using external validator
    const newErrors = validateBankTransfer(
      { transferDate, amount, bankAccount, source },
      {
        dateRequired: t("transfer.validate.dateRequired"),
        amountRequired: t("transfer.validate.amountRequired"),
        amountPositive: t("transfer.validate.amountPositive"),
        bankAccountRequired: t("transfer.validate.bankAccountRequired"),
        sourceRequired: t("transfer.validate.sourceRequired"),
      },
    );
    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      logger.warn("Form validation failed", { errors: newErrors });
      return;
    }

    setSubmitting(true);
    try {
      const result = await createBankTransfer(
        transferDate,
        Math.round(parseFloat(amount) * 1000),
        transferType,
        bankAccount,
        source,
      );

      if (result.success) {
        showSnackbar("success", t("transfer.add.success"));
        // Emit event for parent to refresh
        window.dispatchEvent(new Event("banktransfer_created"));
        // Reset form
        setTransferDate("");
        setAmount("");
        setTransferType("FUND");
        setBankAccount("");
        setSource("");
        setSelectedFund(null);
        setSelectedPatient(null);
        setErrors({});
      } else {
        showSnackbar("error", t("transfer.add.error", { error: result.error }));
      }
    } catch (error) {
      logger.error("Exception creating transfer", { error });
      showSnackbar("error", t("transfer.add.errorUnknown"));
    } finally {
      setSubmitting(false);
    }
  };

  return {
    // Form state
    transferDate,
    setTransferDate,
    amount,
    setAmount,
    transferType,
    handleTypeChange,
    bankAccount,
    setBankAccount,
    source,
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
  };
}
