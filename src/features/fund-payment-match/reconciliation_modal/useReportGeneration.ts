import i18n from "i18next";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AutoCorrection,
  ReconcileAndCandidatesResponse,
  ReportGenerationRequest,
  UnreconciledProcedure,
} from "@/bindings";
import { logger } from "@/infra/logger";
import { toastService } from "@/ui/components/snackbar";
import { exportAndOpenReportPdf } from "../gateway";
import { formatLongDateTime, formatShortDate } from "../shared/formatters";
import { buildCorrectionGroups, buildUnreconciledSection } from "../shared/reportPresenter";

interface UseReportGenerationArgs {
  filePath: string;
  reportDateRange: { start: string; end: string } | null;
  unreconciledReport: UnreconciledProcedure[] | null;
  autoCorrections: Map<string, AutoCorrection>;
  reconciliationData: ReconcileAndCandidatesResponse | null;
  fundIdToLabel: Map<string, string>;
}

interface UseReportGenerationReturn {
  handleReport: () => Promise<void>;
  isGenerating: boolean;
}

const TAG = "[useReportGeneration]";

/**
 * Drives the post-reconciliation report flow (FPR-011 to FPR-019).
 *
 * Assembles the `ReportGenerationRequest` with every label and value
 * pre-resolved (ADR-006), then issues a single gateway call that
 * renders the PDF, writes it to the user's Downloads directory, and
 * opens it in the system default PDF viewer. The filename is built
 * locale-side (`rapport_rapprochement_caisse_{YYYY-MM}.pdf` for `fr`,
 * `fund_reconciliation_report_{YYYY-MM}.pdf` for everything else), where
 * `YYYY-MM` is the month of the period end date.
 *
 * Failure surfaces as an error toast (FPR-014); the Report button
 * returns to its idle state so the user can retry.
 */
export function useReportGeneration({
  filePath,
  reportDateRange,
  unreconciledReport,
  autoCorrections,
  reconciliationData,
  fundIdToLabel,
}: UseReportGenerationArgs): UseReportGenerationReturn {
  const { t } = useTranslation("fund-payment-match");
  const [isGenerating, setIsGenerating] = useState(false);

  const handleReport = useCallback(async () => {
    if (isGenerating) return;
    if (!reportDateRange || !unreconciledReport) return;

    setIsGenerating(true);

    const locale = i18n.language;
    const now = new Date();
    const tStr = (key: string): string => String(t(key));

    const headerLines = [
      `${tStr("print.header.period")} : ${formatShortDate(reportDateRange.start, locale)} – ${formatShortDate(reportDateRange.end, locale)}`,
      `${tStr("print.header.generated")} : ${formatLongDateTime(now, locale)}`,
      `${tStr("print.header.fileName")} : ${filePath.split(/[\\/]/).pop() ?? filePath}`,
    ];

    const correctionGroups = buildCorrectionGroups({
      autoCorrections,
      matches: reconciliationData?.reconciliation.matches ?? [],
      fundIdToLabel,
      locale,
      t: tStr,
    });

    const request: ReportGenerationRequest = {
      title: tStr("print.title"),
      continuation_title: `${tStr("print.title")} (${tStr("print.continued")})`,
      header_lines: headerLines,
      unreconciled: buildUnreconciledSection(unreconciledReport, locale, tStr),
      correction_section_heading: tStr("print.section2.heading"),
      correction_groups: correctionGroups,
      page_label: tStr("print.page"),
    };

    const filename = buildExportFilename(reportDateRange.end, tStr);

    try {
      const savedPath = await exportAndOpenReportPdf(request, filename);
      const savedName = savedPath.split(/[\\/]/).pop() ?? filename;
      toastService.show(
        "success",
        String(t("modal.report.exportSuccess", { filename: savedName })),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(TAG, "Failed to export report PDF", message);
      toastService.show("error", tStr("modal.report.error.exportFailed"));
    } finally {
      setIsGenerating(false);
    }
  }, [
    isGenerating,
    reportDateRange,
    unreconciledReport,
    autoCorrections,
    reconciliationData,
    fundIdToLabel,
    filePath,
    t,
  ]);

  return { handleReport, isGenerating };
}

/**
 * Build the leaf filename passed to the backend.
 *
 * The translated stem is taken from `modal.report.filename.stem`; the
 * month tag is the `YYYY-MM` slice of the period end date — the user's
 * "majority month" by construction (reports usually cover most of one
 * month with a few overflow days at the start).
 */
function buildExportFilename(periodEndIso: string, tStr: (key: string) => string): string {
  const stem = tStr("modal.report.filename.stem");
  const monthTag = periodEndIso.slice(0, 7);
  return `${stem}_${monthTag}.pdf`;
}
