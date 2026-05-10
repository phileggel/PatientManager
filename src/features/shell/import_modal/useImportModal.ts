import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { toastService } from "@/core/snackbar";
import { useAppStore } from "@/lib/appStore";
import { pickExcelFilePath, pickPdfFilePath } from "../gateway";
import type { Page } from "../types";
import { getLastFolder, type ImportKind, parentDir, setLastFolder } from "./lastFolderStore";

type ImportPage = "excel-import" | "fund-payment-match" | "bank-statement-match";

function rememberParentFolder(kind: ImportKind, pickedPath: string): void {
  const parent = parentDir(pickedPath);
  if (parent !== undefined) {
    setLastFolder(kind, parent);
  }
}

interface UseImportModalProps {
  onNavigate: (page: Page) => void;
  onClose: () => void;
  onFileSelected: (page: ImportPage, filePath: string) => void;
}

interface UseImportModalReturn {
  handleExcelImport: () => Promise<void>;
  handleFundReconciliation: () => Promise<void>;
  handleBankReconciliation: () => Promise<void>;
  isPicking: boolean;
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
      const path = await pickExcelFilePath(t("excel.dialogTitle"), getLastFolder("excel"));
      if (!path) return;
      rememberParentFolder("excel", path);
      onFileSelected("excel-import", path);
      onClose();
    } finally {
      setIsPicking(false);
    }
  }, [onFileSelected, onClose, t]);

  const handleFundReconciliation = useCallback(async () => {
    if (fundCount === 0) {
      toastService.show("info", t("prerequisites.noFund"));
      onNavigate("funds");
      onClose();
      return;
    }
    setIsPicking(true);
    try {
      const path = await pickPdfFilePath(
        t("fundReconciliation.dialogTitle"),
        getLastFolder("fund-pdf"),
      );
      if (!path) return;
      rememberParentFolder("fund-pdf", path);
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
      const path = await pickPdfFilePath(
        t("bankReconciliation.dialogTitle"),
        getLastFolder("bank-pdf"),
      );
      if (!path) return;
      rememberParentFolder("bank-pdf", path);
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
