import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { toastService } from "@/core/snackbar";
import { useAppStore } from "@/lib/appStore";
import type { Page } from "../types";

type ImportPage = "excel-import" | "fund-payment-match" | "bank-statement-match";

interface UseImportModalProps {
  onNavigate: (page: Page) => void;
  onClose: () => void;
  onFileSelected: (page: ImportPage, filePath: string) => void;
}

interface UseImportModalReturn {
  handleExcelImport: () => void;
  handleFundReconciliation: () => void;
  handleBankReconciliation: () => void;
  isPicking: boolean;
}

function resolveFilePath(result: string | string[] | null): string | null {
  if (!result) return null;
  if (Array.isArray(result)) return result[0] ?? null;
  return result;
}

/**
 * Hook for the unified import modal.
 * Opens the OS file picker on button click (no page navigation until a file is selected).
 * Checks prerequisites (funds, bank accounts) before opening the picker.
 */
export function useImportModal({
  onNavigate,
  onClose,
  onFileSelected,
}: UseImportModalProps): UseImportModalReturn {
  const { t } = useTranslation("import-modal");
  const fundCount = useAppStore((state) => state.funds.length);
  const bankAccountCount = useAppStore((state) => state.bankAccounts.length);
  const [isPicking, setIsPicking] = useState(false);

  const handleExcelImport = useCallback(async () => {
    setIsPicking(true);
    try {
      const result = await open({
        multiple: false,
        filters: [{ name: "Excel Files", extensions: ["xlsx", "xls", "csv"] }],
      });
      const path = resolveFilePath(result);
      if (!path) return;
      onFileSelected("excel-import", path);
      onClose();
    } finally {
      setIsPicking(false);
    }
  }, [onFileSelected, onClose]);

  const handleFundReconciliation = useCallback(async () => {
    if (fundCount === 0) {
      toastService.show("info", t("prerequisites.noFund"));
      onNavigate("funds");
      onClose();
      return;
    }
    setIsPicking(true);
    try {
      const result = await open({
        multiple: false,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      const path = resolveFilePath(result);
      if (!path) return;
      onFileSelected("fund-payment-match", path);
      onClose();
    } finally {
      setIsPicking(false);
    }
  }, [fundCount, onNavigate, onClose, onFileSelected, t]);

  const handleBankReconciliation = useCallback(async () => {
    if (bankAccountCount === 0) {
      toastService.show("info", t("prerequisites.noBankAccount"));
      onNavigate("bank-account");
      onClose();
      return;
    }
    setIsPicking(true);
    try {
      const result = await open({
        multiple: false,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      const path = resolveFilePath(result);
      if (!path) return;
      onFileSelected("bank-statement-match", path);
      onClose();
    } finally {
      setIsPicking(false);
    }
  }, [bankAccountCount, onNavigate, onClose, onFileSelected, t]);

  return {
    handleExcelImport,
    handleFundReconciliation,
    handleBankReconciliation,
    isPicking,
  };
}
