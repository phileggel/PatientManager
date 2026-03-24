import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { toastService } from "@/core/snackbar";
import { useAppStore } from "@/lib/appStore";
import type { Page } from "../types";

interface UseImportModalProps {
  onNavigate: (page: Page) => void;
  onClose: () => void;
}

interface UseImportModalReturn {
  handleExcelImport: () => void;
  handleFundReconciliation: () => void;
  handleBankReconciliation: () => void;
}

/**
 * Hook for the unified import modal.
 * Checks prerequisites (funds, bank accounts) before navigating.
 */
export function useImportModal({ onNavigate, onClose }: UseImportModalProps): UseImportModalReturn {
  const { t } = useTranslation("import-modal");
  const fundCount = useAppStore((state) => state.funds.length);
  const bankAccountCount = useAppStore((state) => state.bankAccounts.length);

  const handleExcelImport = useCallback(() => {
    onNavigate("excel-import");
    onClose();
  }, [onNavigate, onClose]);

  const handleFundReconciliation = useCallback(() => {
    if (fundCount === 0) {
      toastService.show("info", t("prerequisites.noFund"));
      onNavigate("funds");
    } else {
      onNavigate("fund-payment-match");
    }
    onClose();
  }, [fundCount, onNavigate, onClose, t]);

  const handleBankReconciliation = useCallback(() => {
    if (bankAccountCount === 0) {
      toastService.show("info", t("prerequisites.noBankAccount"));
      onNavigate("bank-account");
    } else {
      onNavigate("bank-statement-match");
    }
    onClose();
  }, [bankAccountCount, onNavigate, onClose, t]);

  return {
    handleExcelImport,
    handleFundReconciliation,
    handleBankReconciliation,
  };
}
