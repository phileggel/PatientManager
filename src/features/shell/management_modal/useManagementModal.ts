import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { toastService } from "@/core/snackbar";
import { useAppStore } from "@/lib/appStore";
import type { Page } from "../types";

interface UseManagementModalProps {
  onNavigate: (page: Page) => void;
  onClose: () => void;
}

interface UseManagementModalReturn {
  handlePatient: () => void;
  handleFunds: () => void;
  handleProcedureTypes: () => void;
  handleFundPayment: () => void;
  handleBankTransfer: () => void;
  handleBankAccount: () => void;
}

/**
 * Hook for the management modal.
 * Checks prerequisites (funds, bank accounts) before navigating to fund-payment and bank-transfer.
 */
export function useManagementModal({
  onNavigate,
  onClose,
}: UseManagementModalProps): UseManagementModalReturn {
  const { t } = useTranslation("management-modal");
  const fundCount = useAppStore((state) => state.funds.length);
  const bankAccountCount = useAppStore((state) => state.bankAccounts.length);

  const handlePatient = useCallback(() => {
    onNavigate("patient");
    onClose();
  }, [onNavigate, onClose]);

  const handleFunds = useCallback(() => {
    onNavigate("funds");
    onClose();
  }, [onNavigate, onClose]);

  const handleProcedureTypes = useCallback(() => {
    onNavigate("procedure-types");
    onClose();
  }, [onNavigate, onClose]);

  const handleFundPayment = useCallback(() => {
    if (fundCount === 0) {
      toastService.show("info", t("prerequisites.noFund"));
      onNavigate("funds");
    } else {
      onNavigate("fund-payment");
    }
    onClose();
  }, [fundCount, onNavigate, onClose, t]);

  const handleBankTransfer = useCallback(() => {
    if (bankAccountCount === 0) {
      toastService.show("info", t("prerequisites.noBankAccount"));
      onNavigate("bank-account");
    } else {
      onNavigate("bank-transfer");
    }
    onClose();
  }, [bankAccountCount, onNavigate, onClose, t]);

  const handleBankAccount = useCallback(() => {
    onNavigate("bank-account");
    onClose();
  }, [onNavigate, onClose]);

  return {
    handlePatient,
    handleFunds,
    handleProcedureTypes,
    handleFundPayment,
    handleBankTransfer,
    handleBankAccount,
  };
}
