import { type SyntheticEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Procedure } from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";
import { logger } from "@/infra/logger";
import { createFundPayment } from "../gateway";
import { formatManualManagementError } from "../shared/errorPresenter";
import { FundPaymentPresenter } from "../shared/presenter";
import { type PaymentFormErrors, validatePaymentForm } from "../shared/validatePayment";

export function useAddFundPaymentPanel() {
  const { t } = useTranslation("fund-payment");

  // get the existing funds
  const funds = useCacheStore((state) => state.funds);

  // form states
  const [selectedFundId, setSelectedFundId] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [errors, setErrors] = useState<PaymentFormErrors>({});

  // modal states
  const [selectedProcedures, setSelectedProcedures] = useState<Procedure[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedFund = useMemo(() => {
    const fund = funds.find((f) => f.id === selectedFundId);
    return FundPaymentPresenter.toDisplayData(fund);
  }, [selectedFundId, funds]);

  const fundSelectorLabels = useMemo(() => {
    return FundPaymentPresenter.toSelectorOptions(funds, t("form.select_fund"));
  }, [funds, t]);

  const selectionSummary = useMemo(() => {
    return FundPaymentPresenter.toSelectionSummary(selectedProcedures);
  }, [selectedProcedures]);

  const hasSelection = !selectionSummary.isEmpty;

  // Clear errors when user changes fund
  const handleFundChange = (value: string) => {
    setSelectedFundId(value);
    if (errors.fund) {
      setErrors((prev) => ({ ...prev, fund: undefined }));
    }
  };

  // Clear errors when user changes date
  const handleDateChange = (value: string) => {
    setPaymentDate(value);
    if (errors.paymentDate) {
      setErrors((prev) => ({ ...prev, paymentDate: undefined }));
    }
  };

  // Open the selection modal with validation
  const handleOpenSelection = (e?: SyntheticEvent) => {
    e?.preventDefault();

    // Validate fund and date (not procedures yet)
    const newErrors = validatePaymentForm(selectedFundId, paymentDate, hasSelection, false, {
      fundRequired: t("form.fund_required"),
      paymentDateRequired: t("form.payment_date_required"),
      proceduresRequired: t("form.procedures_required"),
    });
    setErrors(newErrors);

    if (Object.keys(newErrors).length === 0) {
      setIsModalOpen(true);
    } else {
      logger.warn("Cannot open modal: validation failed", { errors: newErrors });
    }
  };

  // Modal return - receives procedures directly
  const handleConfirmSelection = (procedures: Procedure[]) => {
    setSelectedProcedures(procedures);
    setIsModalOpen(false);
    // Clear procedures error when selection made
    if (errors.procedures) {
      setErrors((prev) => ({ ...prev, procedures: undefined }));
    }
    logger.info("Procedures selected for payment", { count: procedures.length });
  };

  // Creation with full validation
  const handleCreatePayment = async () => {
    // Validate all fields including procedures
    const newErrors = validatePaymentForm(selectedFundId, paymentDate, hasSelection, true, {
      fundRequired: t("form.fund_required"),
      paymentDateRequired: t("form.payment_date_required"),
      proceduresRequired: t("form.procedures_required"),
    });
    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      logger.warn("Cannot create payment: validation failed", { errors: newErrors });
      return { success: false };
    }

    setIsSubmitting(true);

    try {
      const result = await createFundPayment(selectedFundId, paymentDate, selectedProcedures);

      if (result.success) {
        setSelectedFundId("");
        setPaymentDate("");
        setSelectedProcedures([]);
        setErrors({});
        return { success: true };
      }
      return { success: false, error: t(formatManualManagementError(result.error).key) };
    } catch (error) {
      logger.error("Exception creating fund payment group", { error });
      return { success: false, error: t("errors.unexpected") };
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    selectedFundId,
    setSelectedFundId: handleFundChange,
    paymentDate,
    setPaymentDate: handleDateChange,
    errors,
    // selected Fund
    selectedFund,
    selectedProcedures,
    isModalOpen,
    setIsModalOpen,
    isSubmitting,
    fundSelectorLabels,
    selectionSummary,
    hasSelection,
    handleOpenSelection,
    handleConfirmSelection,
    handleCreatePayment,
  };
}
