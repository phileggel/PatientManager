import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCacheStore } from "@/infra/cache/store";
import { toastService } from "@/ui/components/snackbar";
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
  const fundCount = useCacheStore((state) => state.funds.length);
  const [isPicking, setIsPicking] = useState(false);

  const handleExcelImport = useCallback(async () => {
    setIsPicking(true);
    try {
      const path = await pickExcelFilePath(t("excel.dialog_title"), getLastFolder("excel"));
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
      toastService.show("info", t("prerequisites.no_fund"));
      onNavigate("funds");
      onClose();
      return;
    }
    setIsPicking(true);
    try {
      const path = await pickPdfFilePath(
        t("fund_reconciliation.dialog_title"),
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

  // BAS-013 — with no account yet, the import offers to create it from the statement (#518).
  const handleBankReconciliation = useCallback(async () => {
    setIsPicking(true);
    try {
      const path = await pickPdfFilePath(
        t("bank_reconciliation.dialog_title"),
        getLastFolder("bank-pdf"),
      );
      if (!path) return;
      rememberParentFolder("bank-pdf", path);
      onFileSelected("bank-statement-match", path);
      onClose();
    } finally {
      setIsPicking(false);
    }
  }, [onClose, onFileSelected, t]);

  return {
    handleExcelImport,
    handleFundReconciliation,
    handleBankReconciliation,
    isPicking,
  };
}
