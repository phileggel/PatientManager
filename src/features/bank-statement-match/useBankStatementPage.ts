/**
 * Hook for BankStatementPage.
 * Manages file selection, modal open/close state, the close→navigate flow,
 * and the auto-open / cancel-listener lifecycle tied to the file input.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";

const TAG = "[BankStatementPage]";

interface UseBankStatementPageOptions {
  onClose: () => void;
}

export function useBankStatementPage({ onClose }: UseBankStatementPageOptions) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    logger.info(TAG, "Hook mounted; opening file picker");
    fileInputRef.current?.click();
  }, []);

  // The native HTML5 `cancel` event fires when the user dismisses the picker
  // without selecting a file. React doesn't surface it as a synthetic event,
  // so we attach it manually.
  useEffect(() => {
    const input = fileInputRef.current;
    if (!input) return;
    const cancel = () => {
      logger.info(TAG, "File picker cancelled; navigating back");
      onClose();
    };
    input.addEventListener("cancel", cancel);
    return () => input.removeEventListener("cancel", cancel);
  }, [onClose]);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      logger.info(TAG, "Bank statement PDF selected", { name: file.name, size: file.size });
      setSelectedFile(file);
      setIsModalOpen(true);
    }
  }, []);

  const handleClose = useCallback(() => {
    setIsModalOpen(false);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    onClose();
  }, [onClose]);

  return {
    selectedFile,
    isModalOpen,
    fileInputRef,
    handleFileSelect,
    handleClose,
  };
}
