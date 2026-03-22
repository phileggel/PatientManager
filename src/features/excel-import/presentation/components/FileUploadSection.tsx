import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { logger } from "@/lib/logger";
import { Button } from "@/ui/components/button";

interface FileUploadSectionProps {
  onFileSelect: (fileData: { name: string; path: string }) => void;
  isLoading: boolean;
}

export function FileUploadSection({ onFileSelect, isLoading }: FileUploadSectionProps) {
  const { t } = useTranslation("excel-import");
  const [isDragActive, setIsDragActive] = useState(false);

  useEffect(() => {
    logger.info("[FileUploadSection] Component mounted");
  }, []);

  const handleFilePickerClick = async () => {
    try {
      const filePath = await open({
        multiple: false,
        filters: [
          {
            name: "Excel Files",
            extensions: ["xlsx", "xls", "csv"],
          },
        ],
      });

      if (filePath && typeof filePath === "string") {
        logger.info("File selected via dialog", { filePath });
        // Extract filename from path
        const fileName = filePath.split(/[\\/]/).pop() || filePath;
        onFileSelect({ name: fileName, path: filePath });
      } else if (filePath && Array.isArray(filePath) && filePath.length > 0) {
        const selectedPath = filePath[0];
        logger.info("File selected via dialog", { filePath: selectedPath });
        const fileName = selectedPath.split(/[\\/]/).pop() || selectedPath;
        onFileSelect({ name: fileName, path: selectedPath });
      }
    } catch (error) {
      logger.error("File picker error", { error });
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file) {
        logger.info("File dropped", { fileName: file.name, fileSize: file.size });
      }

      // For Tauri, we need to use the file picker for security reasons
      // The dropped file object doesn't have the full path
      // So we'll trigger the file picker instead
      handleFilePickerClick();
    }
  };

  return (
    <div className="mb-8 p-6 bg-m3-surface-container-low rounded-xl">
      <h2 className="text-xl font-semibold text-m3-on-surface mb-4">{t("step1.title")}</h2>

      <section
        aria-label={t("dropzone.ariaLabel")}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
          isDragActive
            ? "border-m3-primary bg-m3-primary-container/20"
            : "border-m3-outline-variant bg-m3-surface hover:border-m3-primary/50 hover:bg-m3-surface-variant/20"
        }`}
      >
        <div className="mb-4">
          <svg
            className="mx-auto h-12 w-12 text-neutral-40"
            stroke="currentColor"
            fill="none"
            viewBox="0 0 48 48"
          >
            <title>Upload file icon</title>
            <path
              d="M28 8H12a4 4 0 00-4 4v20a4 4 0 004 4h24a4 4 0 004-4V20m-10-6l-4-4m0 0l-4 4m4-4v16"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div className="mb-2">
          <p className="text-neutral-70 font-medium">{t("dropzone.text")}</p>
          <p className="text-sm text-neutral-50">{t("dropzone.or")}</p>
        </div>

        <Button
          variant="secondary"
          onClick={handleFilePickerClick}
          disabled={isLoading}
          loading={isLoading}
        >
          {isLoading ? t("dropzone.processing") : t("dropzone.select")}
        </Button>

        <div className="mt-4 text-xs text-neutral-60">
          <p>{t("dropzone.formats")}</p>
          <p>{t("dropzone.maxSize")}</p>
        </div>
      </section>
    </div>
  );
}
