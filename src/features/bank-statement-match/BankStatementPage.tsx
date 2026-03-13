import { FileText } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { logger } from "@/lib/logger";
import { Button } from "@/ui/components/button";
import { BankStatementModal } from "./ui/BankStatementModal";

const TAG = "[BankStatementPage]";

export function BankStatementPage() {
  const { t } = useTranslation("bank");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      logger.info(TAG, "Bank statement PDF selected", { name: file.name, size: file.size });
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
    logger.info(TAG, "Upload button clicked");
    if (fileInputRef.current) {
      logger.info(TAG, "Triggering file input click");
      fileInputRef.current.click();
    } else {
      logger.error(TAG, "File input ref not found");
    }
  };

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-8">
        <div className="text-center space-y-4">
          <FileText className="w-16 h-16 mx-auto text-primary-60" />
          <h2 className="text-2xl font-semibold text-slate-900">{t("statement.title")}</h2>
          <p className="text-slate-600 max-w-md">{t("statement.description")}</p>
        </div>

        <Button onClick={handleUploadClick} variant="primary" size="lg">
          {t("statement.selectButton")}
        </Button>

        <p className="text-sm text-slate-500 text-center">{t("statement.acceptedFormats")}</p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={handleFileSelect}
        style={{ display: "none" }}
        aria-label={t("statement.modal.closeAria")}
      />

      {selectedFile && isModalOpen && (
        <BankStatementModal file={selectedFile} onClose={handleModalClose} />
      )}
    </div>
  );
}
