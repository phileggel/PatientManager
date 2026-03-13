import {
  type CreateFundPaymentFromCandidatesRequest,
  type CreateFundPaymentWithAutoCorrectionsRequest,
  commands,
  type FundPaymentGroup,
  type PdfParseResult,
  type ReconcileAndCandidatesResponse,
  type ReconciliationResult,
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
  logger.debug(TAG, "Extracting text from PDF", filePath);

  const result = await commands.extractPdfText(filePath);

  if (result.status === "error") {
    logger.error(TAG, "Failed to extract PDF text", result.error);
    throw new Error(result.error);
  }

  logger.info(TAG, `Successfully extracted ${result.data.length} characters`);
  return result.data;
}

/**
 * Extract text content from a PDF file using bytes
 *
 * @param file - File object containing the PDF
 * @returns Extracted text content
 * @throws Error if extraction fails
 */
export async function extractPdfTextFromFile(file: File): Promise<string> {
  logger.debug(TAG, "Extracting text from PDF file", file.name);

  // Read file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();
  const bytes = Array.from(new Uint8Array(arrayBuffer));

  logger.debug(TAG, `Read ${bytes.length} bytes from file`);

  const result = await commands.extractPdfTextFromBytes(bytes);

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
 * Reconcile PDF procedures with database
 *
 * @param parseResult - Parsed PDF procedure data
 * @returns Reconciliation result with matched/not-found procedures
 * @throws Error if reconciliation fails
 */
export async function reconcilePdfProcedures(
  parseResult: PdfParseResult,
): Promise<ReconciliationResult> {
  logger.debug(TAG, "Reconciling PDF procedures");

  const result = await commands.reconcilePdfProcedures(parseResult);

  if (result.status === "error") {
    logger.error(TAG, "Reconciliation failed", result.error);
    throw new Error(result.error);
  }

  logger.info(TAG, `Reconciled: ${result.data.matches.length} matched`);
  return result.data;
}

/**
 * Export reconciliation results to CSV format and save to file
 *
 * @param result - Reconciliation result to export
 * @throws Error if export or file save fails
 * @throws Error is silently ignored if user cancels the save dialog
 */
export async function exportReconciliationCsv(result: ReconciliationResult): Promise<void> {
  try {
    logger.debug(TAG, "Exporting reconciliation results to CSV");

    // Generate CSV on backend
    logger.debug(TAG, "Calling backend export command");
    const csvResult = await commands.exportReconciliationCsv(result);

    if (csvResult.status === "error") {
      logger.error(TAG, "CSV export failed", csvResult.error);
      throw new Error(csvResult.error);
    }

    const csvContent = csvResult.data;
    logger.debug(TAG, `Generated CSV: ${csvContent.length} bytes`);

    // Import plugins for file operations
    logger.debug(TAG, "Importing Tauri plugins");
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    logger.debug(TAG, "Plugins imported successfully");

    // Get file path from user
    logger.debug(TAG, "Opening save dialog");
    const filePath = await save({
      defaultPath: `reconciliation_${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [
        {
          name: "CSV Files",
          extensions: ["csv"],
        },
      ],
    });

    if (!filePath) {
      // User cancelled the save dialog
      logger.debug(TAG, "CSV export cancelled by user");
      return;
    }

    logger.debug(TAG, `Writing CSV to file: ${filePath}`);
    // Write CSV to file
    await writeTextFile(filePath, csvContent);

    logger.info(TAG, `CSV exported successfully to ${filePath}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(TAG, "Export operation failed", errorMessage);
    throw error;
  }
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
 * Create fund payment groups from validated reconciliation candidates
 *
 * For each candidate:
 * 1. Resolves fund label to fund ID
 * 2. Creates a FundPaymentGroup
 * 3. Updates procedures with reconciliation status
 *
 * @param request - Request containing validated candidates
 * @returns Created fund payment groups
 * @throws Error if creation fails for any candidate
 */
export async function createFundPaymentFromCandidates(
  request: CreateFundPaymentFromCandidatesRequest,
): Promise<FundPaymentGroup[]> {
  logger.debug(TAG, "Creating fund payment groups from validated candidates", {
    candidateCount: request.candidates.length,
  });

  const result = await commands.createFundPaymentFromCandidates(request);

  if (result.status === "error") {
    logger.error(TAG, "Failed to create fund payment groups", result.error);
    throw new Error(result.error);
  }

  logger.info(TAG, `Created ${result.data.length} fund payment groups successfully`);
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
