/**
 * Hook for ReconciliationPage.
 * Manages file selection and modal open/close state.
 */

import { useRef, useState } from "react";
import { logger } from "@/lib/logger";

const TAG = "[ReconciliationPage]";

export function useReconciliationPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      logger.info(TAG, "PDF file selected", { name: file.name, size: file.size });
      setSelectedFile(file);
      setIsModalOpen(true);
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return {
    selectedFile,
    isModalOpen,
    fileInputRef,
    handleFileSelect,
    handleModalClose,
    handleUploadClick,
  };
}
