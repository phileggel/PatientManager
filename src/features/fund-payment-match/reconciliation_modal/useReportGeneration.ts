import i18n from "i18next";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AutoCorrection,
  ReconcileAndCandidatesResponse,
  ReportGenerationRequest,
  UnreconciledProcedure,
} from "@/bindings";
import { toastService } from "@/core/snackbar";
import { logger } from "@/lib/logger";
import { generateReportPdf } from "../gateway";
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
  previewBytes: Uint8Array | null;
  previewRequest: ReportGenerationRequest | null;
  defaultFilename: string;
  closePreview: () => void;
}

const TAG = "[useReportGeneration]";

/**
 * Drives the post-reconciliation report flow (FPR-011, FPR-013, FPR-014,
 * FPR-015, FPR-018, FPR-019).
 *
 * Assembles the `ReportGenerationRequest` with every label and value
 * pre-resolved (per ADR-006: backend has no i18n) and dispatches it through
 * the gateway. Owns the preview-modal state machine (`previewBytes`,
 * `isGenerating`). Failures surface as an error toast (FPR-014); the modal
 * stays unaffected and the Report button returns to its idle state so the
 * user can retry.
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
  // `bytes` and `request` are correlated — they must always travel together
  // because the preview iframe shows the rendered bytes and Save (FPR-016)
  // re-renders from the same request that produced them. Storing them as
  // one state value enforces the invariant in the type system.
  const [previewState, setPreviewState] = useState<{
    bytes: Uint8Array;
    request: ReportGenerationRequest;
  } | null>(null);

  const defaultFilename = useMemo(() => {
    if (!reportDateRange) return "reconciliation.pdf";
    return `reconciliation-${reportDateRange.start}-to-${reportDateRange.end}.pdf`;
  }, [reportDateRange]);

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

    try {
      const bytes = await generateReportPdf(request);
      setPreviewState({ bytes, request });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(TAG, "Failed to generate report PDF", message);
      toastService.show("error", tStr("modal.report.error.generationFailed"));
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

  const closePreview = useCallback(() => {
    setPreviewState(null);
  }, []);

  return {
    handleReport,
    isGenerating,
    previewBytes: previewState?.bytes ?? null,
    previewRequest: previewState?.request ?? null,
    defaultFilename,
    closePreview,
  };
}
