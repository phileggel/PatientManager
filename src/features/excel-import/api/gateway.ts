/**
 * Excel Import Gateway Service
 *
 * Simplified 4-step import workflow:
 * 1. Parse Excel file → extract raw entities with temp_ids (preview)
 * 2. User maps Excel amounts to procedure type IDs (UI step)
 * 3. Execute full import on backend → ImportExecutionResult
 * 4. Display result
 *
 * All orchestration (patients, funds, procedures) is handled backend-side.
 * The frontend only passes parsed_data and the type mapping to execute_excel_import.
 *
 * All functions wrap Tauri commands and convert errors to ServiceResult.
 */

import type {
  ExcelAmountMapping,
  ImportExecutionResult,
  ParseExcelResponse,
  SaveExcelAmountMappingRequest,
} from "@/bindings";
import { commands } from "@/bindings";
import { logger } from "@/lib/logger";

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Parse Excel file from file path.
 *
 * First step of import workflow. Extracts patients, funds, and procedures from Excel,
 * assigns temp_ids to all entities, and reports parsing issues (missing sheets, skipped rows).
 * No database writes occur at this step.
 *
 * @param filePath - Full file path to Excel file
 * @returns Service result with ParseExcelResponse containing parsed data and issues
 */
export async function parseExcelFile(filePath: string): Promise<ServiceResult<ParseExcelResponse>> {
  logger.info("Parsing Excel file", { filePath });

  try {
    const result = await commands.parseExcelFile(filePath);

    if (result.status === "ok") {
      logger.info("Excel file parsed successfully", {
        patients: result.data.patients.length,
        funds: result.data.funds.length,
        procedures: result.data.procedures.length,
        skipped_rows: result.data.parsing_issues.skipped_rows.length,
        missing_sheets: result.data.parsing_issues.missing_sheets.length,
      });
      return { success: true, data: result.data };
    } else {
      logger.error("Failed to parse Excel file", { error: result.error });
      return { success: false, error: result.error };
    }
  } catch (error) {
    logger.error("Exception during Excel parsing", { error });
    return { success: false, error: String(error) };
  }
}

/**
 * Execute the full Excel import: create patients, funds, and procedures.
 *
 * The backend resolves temp_ids, finds or creates entities, and returns
 * counts of created/reused entities. latest_xx patient fields are updated.
 *
 * IMPORTANT: Pass the exact ParseExcelResponse from parseExcelFile without re-parsing.
 * The procedure_type_tmp_ids are random UUIDs generated at parse time; re-parsing
 * would generate different IDs that would not match the user's type mapping.
 *
 * @param parsedData - The ParseExcelResponse from parseExcelFile
 * @param typeMapping - Maps procedure_type_tmp_id → procedure_type_id (from user mapping step)
 * @returns Service result with ImportExecutionResult
 */
/**
 * Fetch all saved Excel amount → procedure type mappings.
 * Used to pre-fill defaults in the mapping step.
 */
export async function getExcelAmountMappings(): Promise<ServiceResult<ExcelAmountMapping[]>> {
  try {
    const result = await commands.getExcelAmountMappings();
    if (result.status === "ok") {
      return { success: true, data: result.data };
    }
    return { success: false, error: result.error };
  } catch (error) {
    logger.error("Exception fetching excel amount mappings", { error });
    return { success: false, error: String(error) };
  }
}

/**
 * Persist the user's amount → procedure type mapping choices for future imports.
 * Fire-and-forget: failures are logged but do not block the import flow.
 */
export async function saveExcelAmountMappings(
  mappings: SaveExcelAmountMappingRequest[],
): Promise<void> {
  try {
    const result = await commands.saveExcelAmountMappings(mappings);
    if (result.status !== "ok") {
      logger.error("Failed to save excel amount mappings", { error: result.error });
    }
  } catch (error) {
    logger.error("Exception saving excel amount mappings", { error });
  }
}

export async function executeExcelImport(
  parsedData: ParseExcelResponse,
  typeMapping: Record<string, string>,
  selectedMonths: string[],
): Promise<ServiceResult<ImportExecutionResult>> {
  logger.info("Executing Excel import", {
    patients: parsedData.patients.length,
    funds: parsedData.funds.length,
    procedures: parsedData.procedures.length,
    mappedTypes: Object.keys(typeMapping).length,
    selectedMonths,
  });

  try {
    const result = await commands.executeExcelImport(parsedData, typeMapping, selectedMonths);

    if (result.status === "ok") {
      logger.info("Excel import completed", {
        patients_created: result.data.patients_created,
        patients_reused: result.data.patients_reused,
        funds_created: result.data.funds_created,
        funds_reused: result.data.funds_reused,
        procedures_created: result.data.procedures_created,
        procedures_skipped: result.data.procedures_skipped,
      });
      return { success: true, data: result.data };
    } else {
      logger.error("Failed to execute Excel import", { error: result.error });
      return { success: false, error: result.error };
    }
  } catch (error) {
    logger.error("Exception during Excel import execution", { error });
    return { success: false, error: String(error) };
  }
}
