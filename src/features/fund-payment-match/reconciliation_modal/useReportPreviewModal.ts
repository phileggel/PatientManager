import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toastService } from "@/core/snackbar";
import { logger } from "@/lib/logger";
import { saveReportPdf } from "../gateway";

const TAG = "[useReportPreviewModal]";

interface UseReportPreviewModalArgs {
  bytes: Uint8Array;
  defaultFilename: string;
}

interface UseReportPreviewModalReturn {
  blobUrl: string;
  isSaving: boolean;
  handleSave: () => Promise<void>;
}

/**
 * State + effects for `ReportPreviewModal` (FPR-015, FPR-016).
 *
 * Owns the blob-URL lifecycle (created on mount, revoked on unmount or
 * `bytes` change) and the Save flow including the duplicate-click guard,
 * success/error toast, and `isSaving` indicator.
 */
export function useReportPreviewModal({
  bytes,
  defaultFilename,
}: UseReportPreviewModalArgs): UseReportPreviewModalReturn {
  const { t } = useTranslation("fund-payment-match");

  const blobUrl = useMemo(() => {
    // Cast through `BlobPart` — TS DOM lib types it with the narrower
    // ArrayBuffer-backed Uint8Array; runtime accepts both.
    const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
    return URL.createObjectURL(blob);
  }, [bytes]);

  useEffect(
    () => () => {
      URL.revokeObjectURL(blobUrl);
    },
    [blobUrl],
  );

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const result = await saveReportPdf(bytes, defaultFilename);
      if (result.saved) {
        toastService.show("success", t("modal.preview.saveSuccess"));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(TAG, "Failed to save report PDF", message);
      toastService.show("error", t("modal.preview.saveError"));
    } finally {
      setIsSaving(false);
    }
  }, [bytes, defaultFilename, isSaving, t]);

  return { blobUrl, isSaving, handleSave };
}
