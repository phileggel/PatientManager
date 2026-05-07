import { X } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { logger } from "@/lib/logger";
import { Button } from "@/ui/components/button";
import { IconButton } from "@/ui/components/button/IconButton";
import { ModalContainer } from "@/ui/components/modal/ModalContainer";
import { useReportPreviewModal } from "./useReportPreviewModal";

interface ReportPreviewModalProps {
  bytes: Uint8Array;
  defaultFilename: string;
  onClose: () => void;
}

/**
 * Preview modal for the post-reconciliation PDF report (FPR-015, FPR-016, FPR-018).
 *
 * Embeds the generated PDF via a blob URL in an iframe, exposes Save and
 * Close actions in the footer. Save always keeps the modal open whether the
 * user accepts, cancels, or hits a write error. State + effects live in
 * `useReportPreviewModal` (per F10).
 */
export function ReportPreviewModal({ bytes, defaultFilename, onClose }: ReportPreviewModalProps) {
  const { t } = useTranslation("fund-payment-match");
  const { blobUrl, isSaving, handleSave } = useReportPreviewModal({ bytes, defaultFilename });

  useEffect(() => {
    logger.info("[ReportPreviewModal] Component mounted");
  }, []);

  return (
    <ModalContainer isOpen={true} onClose={onClose} maxWidth="max-w-4xl">
      <div className="flex items-center justify-between px-6 py-4 border-b border-m3-outline/20 shrink-0">
        <h2 className="text-base font-semibold text-m3-on-surface">{t("modal.preview.title")}</h2>
        <IconButton
          icon={<X size={20} />}
          variant="ghost"
          shape="round"
          aria-label={t("modal.header.close")}
          onClick={onClose}
        />
      </div>

      <div className="flex-1 min-h-[60vh] bg-m3-surface-container-low">
        <iframe
          title={t("modal.preview.title")}
          src={blobUrl}
          className="w-full h-full min-h-[60vh] border-0"
        />
      </div>

      <div className="shrink-0 border-t border-m3-outline/20 bg-m3-surface-container-low px-6 py-4">
        <div className="flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            {t("modal.preview.close")}
          </Button>
          <Button variant="primary" loading={isSaving} onClick={handleSave}>
            {t("modal.preview.save")}
          </Button>
        </div>
      </div>
    </ModalContainer>
  );
}
