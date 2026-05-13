import {
  type CreateFundPaymentWithAutoCorrectionsRequest,
  commands,
  type FundPaymentGroup,
  type PdfParseResult,
  type ReconcileAndCandidatesResponse,
  type ReportGenerationRequest,
  type UnreconciledProcedure,
} from "@/bindings";
import { logger } from "@/lib/logger";

const TAG = "[ReconciliationGateway]";

/**
 * Extract text content from a PDF file
 *
 * @param filePath - Absolute path to the PDF file
 * @returns Extracted text content
 * @throws Error if extraction fails
 */
export async function extractPdfText(filePath: string): Promise<string> {
  logger.debug(TAG, "Extracting text from PDF");

  const result = await commands.extractPdfText(filePath);

  if (result.status === "error") {
    logger.error(TAG, "Failed to extract PDF text", result.error);
    throw new Error(result.error);
  }

  logger.info(TAG, `Successfully extracted ${result.data.length} characters`);
  return result.data;
}

/**
 * Parse extracted PDF text into structured procedure groups
 *
 * @param text - Raw extracted PDF text
 * @returns Parsed procedure groups with fund/patient resolution
 * @throws Error if parsing fails
 */
export async function parsePdfText(text: string): Promise<PdfParseResult> {
  logger.debug(TAG, "Parsing PDF text", `${text.length} characters`);

  const result = await commands.parsePdfText(text);

  if (result.status === "error") {
    logger.error(TAG, "Failed to parse PDF text", result.error);
    throw new Error(result.error);
  }

  logger.info(TAG, `Parsed ${result.data.groups.length} groups`);
  return result.data;
}

/**
 * Reconcile PDF and create fund payment candidates
 *
 * This combines parsing, reconciliation, and grouping into a single workflow
 * that returns fund payment candidates ready for user validation.
 *
 * @param parseResult - Parsed PDF procedure data
 * @returns Candidates grouped by fund + payment date, ready for validation
 * @throws Error if reconciliation fails
 */
export async function reconcileAndCreateCandidates(
  parseResult: PdfParseResult,
): Promise<ReconcileAndCandidatesResponse> {
  logger.debug(TAG, "Reconciling PDF and creating fund payment candidates");

  const result = await commands.reconcileAndCreateCandidates(parseResult);

  if (result.status === "error") {
    logger.error(TAG, "Failed to reconcile and create candidates", result.error);
    throw new Error(result.error);
  }

  const issueCount = result.data.reconciliation.matches.filter((m) =>
    ["SingleMatchIssue", "GroupMatchIssue", "TooManyMatchIssue", "NotFoundIssue"].includes(
      m.type as string,
    ),
  ).length;
  logger.info(
    TAG,
    `Created ${result.data.candidates.length} fund payment candidates from ${result.data.reconciliation.matches.length} total matches (${issueCount} issues)`,
  );
  return result.data;
}

/**
 * Create fund payment groups with auto-corrections for anomalies
 *
 * Applies auto-corrections (update amounts, funds, dates, create procedures)
 * then creates fund payment groups from validated candidates.
 *
 * @param request - Request containing candidates and auto-corrections
 * @returns Created fund payment groups
 * @throws Error if creation or corrections fail
 */
export async function createFundPaymentWithAutoCorrections(
  request: CreateFundPaymentWithAutoCorrectionsRequest,
): Promise<FundPaymentGroup[]> {
  logger.debug(TAG, "Creating fund payment groups with auto-corrections", {
    candidateCount: request.candidates.length,
    correctionCount: request.auto_corrections.length,
  });

  const result = await commands.createFundPaymentWithAutoCorrections(request);

  if (result.status === "error") {
    logger.error(TAG, "Failed to create fund payment groups with auto-corrections", result.error);
    throw new Error(result.error);
  }

  logger.info(
    TAG,
    `Created ${result.data.length} fund payment groups with ${request.auto_corrections.length} auto-corrections`,
  );
  return result.data;
}

/**
 * Get all unreconciled procedures in a date range (for post-reconciliation report)
 *
 * @param startDate - Start date in ISO format (YYYY-MM-DD)
 * @param endDate - End date in ISO format (YYYY-MM-DD)
 * @returns List of unreconciled procedures
 * @throws Error if query fails
 */
export async function getUnreconciledProceduresInRange(
  startDate: string,
  endDate: string,
): Promise<UnreconciledProcedure[]> {
  logger.debug(TAG, "Fetching unreconciled procedures in range", { startDate, endDate });

  const result = await commands.getUnreconciledProceduresInRange(startDate, endDate);

  if (result.status === "error") {
    logger.error(TAG, "Failed to fetch unreconciled procedures", result.error);
    throw new Error(result.error);
  }

  logger.info(TAG, `Found ${result.data.length} unreconciled procedures in range`);
  return result.data;
}

/**
 * Generate the post-reconciliation report PDF (FPR-011, FPR-013).
 *
 * The request must already carry every pre-resolved string the renderer will
 * place — translated labels, formatted dates, formatted currency values, and
 * per-correction joined row strings (ADR-006).
 *
 * @param request - Pre-resolved report payload assembled by the hook
 * @returns Generated PDF as a Uint8Array
 * @throws Error if backend rendering or validation fails
 */
export async function generateReportPdf(request: ReportGenerationRequest): Promise<Uint8Array> {
  logger.debug(TAG, "Generating fund reconciliation report PDF");

  const result = await commands.generateFundReconciliationReportPdf(request);

  if (result.status === "error") {
    logger.error(TAG, "Failed to generate report PDF", result.error);
    throw new Error(result.error);
  }

  logger.info(TAG, `Report PDF generated (${result.data.length} bytes)`);
  return new Uint8Array(result.data);
}

/**
 * Render the report, save it to the user's Downloads directory under
 * `filename`, then launch the system default PDF viewer on the saved file
 * (FPR-015, FPR-016).
 *
 * `filename` is a leaf name only — must end in `.pdf`, no path separators,
 * no `..`. The backend rejects anything else and fixes the destination to
 * the platform Downloads directory. On same-name collision a ` (N)` suffix
 * is inserted before the extension, so the returned path may differ from
 * `Downloads/{filename}`.
 *
 * @param request - Pre-resolved payload, same shape as for `generateReportPdf`
 * @param filename - Locale-aware leaf name, e.g. `rapport_rapprochement_caisse_2026-05.pdf`
 * @returns Absolute path of the written file
 * @throws Error if generation, write, or launch fails
 */
export async function exportAndOpenReportPdf(
  request: ReportGenerationRequest,
  filename: string,
): Promise<string> {
  logger.debug(TAG, "Exporting report PDF to Downloads", { filename });

  const result = await commands.exportAndOpenFundReconciliationReportPdf(request, filename);

  if (result.status === "error") {
    logger.error(TAG, "Failed to export and open report PDF", result.error);
    throw new Error(result.error);
  }

  logger.info(TAG, "Report PDF exported and opened");
  return result.data;
}
