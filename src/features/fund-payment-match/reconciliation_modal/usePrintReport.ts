import i18n from "i18next";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AutoCorrection,
  ReconcileAndCandidatesResponse,
  UnreconciledProcedure,
} from "@/bindings";
import { logger } from "@/lib/logger";
import { buildPrintReportHtml } from "../shared/printReport";
import { buildPrintReportViewModel } from "../shared/printReportPresenter";

interface UsePrintReportArgs {
  filePath: string;
  reportDateRange: { start: string; end: string } | null;
  unreconciledReport: UnreconciledProcedure[] | null;
  autoCorrections: Map<string, AutoCorrection>;
  reconciliationData: ReconcileAndCandidatesResponse | null;
}

function fmtDate(iso: string, locale: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts.map(Number);
  if (!y || !m || !d) return iso;
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(y, m - 1, d));
  } catch {
    return iso;
  }
}

function fmtDateTime(date: Date, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

export function usePrintReport({
  filePath,
  reportDateRange,
  unreconciledReport,
  autoCorrections,
  reconciliationData,
}: UsePrintReportArgs): {
  handlePrint: () => void;
  printError: string | null;
  clearPrintError: () => void;
} {
  const { t } = useTranslation("fund-payment-match");
  const [printError, setPrintError] = useState<string | null>(null);

  const handlePrint = useCallback(() => {
    if (!reportDateRange || !unreconciledReport) return;

    const locale = i18n.language;
    const now = new Date();

    const vm = buildPrintReportViewModel({
      pdfFileName: filePath.split(/[\\/]/).pop() ?? filePath,
      periodStart: fmtDate(reportDateRange.start, locale),
      periodEnd: fmtDate(reportDateRange.end, locale),
      generationDate: fmtDateTime(now, locale),
      unreconciled: unreconciledReport,
      autoCorrections,
      matches: reconciliationData?.reconciliation.matches ?? [],
    });

    // Capture locale at print time per FPR-021
    const tForPrint = (key: string, opts?: object): string =>
      String(i18n.t(key, { ns: "fund-payment-match", ...(opts as Record<string, unknown>) }));
    const html = buildPrintReportHtml(vm, tForPrint);

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      logger.error("[usePrintReport] Failed to open print window");
      setPrintError(t("print.error.windowOpenFailed"));
      return;
    }

    logger.info("[usePrintReport] Print window opened");
    setPrintError(null);
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }, [filePath, reportDateRange, unreconciledReport, autoCorrections, reconciliationData, t]);

  const clearPrintError = useCallback(() => {
    setPrintError(null);
  }, []);

  return { handlePrint, printError, clearPrintError };
}
