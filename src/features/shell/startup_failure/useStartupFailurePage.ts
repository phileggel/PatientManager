import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { DiagnosticReportError } from "@/bindings";
import { logger } from "@/infra/logger";
import {
  closeApplication,
  generateStartupFailureReport,
  pickStartupFailureReportPath,
} from "../gateway";

const TAG = "[useStartupFailurePage]";

const pad = (n: number) => String(n).padStart(2, "0");

/** What the page shows once the report is written (DGR-043). */
export interface SavedStartupReport {
  fileName: string;
  supportCode: string;
}

/** DGR-043 — export the failure report, close the application. No snackbar here:
 * the page stands alone, so an error is kept as state and shown inline. */
export function useStartupFailurePage() {
  const { t } = useTranslation("common");
  const [isExporting, setIsExporting] = useState(false);
  const [saved, setSaved] = useState<SavedStartupReport | null>(null);
  const [error, setError] = useState<DiagnosticReportError | "unexpected" | null>(null);

  const exportReport = async () => {
    const now = new Date();
    const fileName = `startup-failure-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.txt`;
    try {
      const destPath = await pickStartupFailureReportPath(
        t("startup_failure.dialog_title"),
        fileName,
      );
      if (!destPath) return; // user cancelled

      // A new attempt replaces the previous result, whatever its outcome.
      setSaved(null);
      setError(null);
      setIsExporting(true);
      const result = await generateStartupFailureReport(destPath);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSaved({
        fileName: destPath.split(/[\\/]/).pop() ?? destPath,
        supportCode: result.data.support_code,
      });
    } catch (err) {
      logger.error(TAG, "start-up failure report failed", { error: String(err) });
      setError("unexpected");
    } finally {
      setIsExporting(false);
    }
  };

  const close = async () => {
    try {
      await closeApplication();
    } catch (err) {
      logger.error(TAG, "closing the application failed", { error: String(err) });
    }
  };

  return { isExporting, saved, error, exportReport, close };
}
