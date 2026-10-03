import { useState } from "react";
import { useTranslation } from "react-i18next";
import { logger } from "@/infra/logger";
import { toastService } from "@/ui/components/snackbar";
import { generateDiagnosticReport, pickDiagnosticReportPath } from "../gateway";
import { formatDiagnosticReportError } from "../shared/errorPresenter";

const TAG = "[useDiagnosticReport]";

const pad = (n: number) => String(n).padStart(2, "0");

/** What the section shows once a report is written (DGR-014). */
export interface SavedDiagnosticReport {
  fileName: string;
  supportCode: string;
}

/** DGR-011 to DGR-015 — pick a destination, write the report, show the result. */
export function useDiagnosticReport() {
  const { t } = useTranslation("db-backup");
  const [isGenerating, setIsGenerating] = useState(false);
  const [saved, setSaved] = useState<SavedDiagnosticReport | null>(null);

  const generate = async () => {
    const now = new Date();
    const fileName = `diagnostic-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.txt`;
    try {
      const destPath = await pickDiagnosticReportPath(t("diagnostic.dialog_title"), fileName);
      if (!destPath) return; // user cancelled

      // A new attempt replaces the previous result, whatever its outcome.
      setSaved(null);
      setIsGenerating(true);
      const result = await generateDiagnosticReport(destPath);
      if (!result.success) {
        toastService.show("error", t(formatDiagnosticReportError(result.error).key));
        return;
      }
      setSaved({
        fileName: destPath.split(/[\\/]/).pop() ?? destPath,
        supportCode: result.data.support_code,
      });
    } catch (err) {
      logger.error(TAG, "diagnostic report failed", { error: String(err) });
      toastService.show("error", t("errors.unexpected"));
    } finally {
      setIsGenerating(false);
    }
  };

  return { isGenerating, saved, generate };
}
