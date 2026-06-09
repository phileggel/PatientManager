import {
  type BankAccount,
  type BankError,
  type BankStatementMatchResult,
  type BankStatementParseResult,
  type BankStatementReconciliationConfig,
  type BankStatementReconciliationError,
  type ConfirmedMatch,
  commands,
  type FundLabelResolution,
  type ResolvedCreditLine,
  type SaveLabelMappingRequest,
} from "@/bindings";
import { logger } from "@/infra/logger";

import type { ServiceResult } from "@/types/api";

const TAG = "[BankStatementGateway]";

// A thrown IPC/serialization failure (the binding only throws on a genuine JS
// `Error`; typed backend errors return as a `status: "error"` Result) is an
// infrastructure failure with no domain meaning — surface it as `DatabaseError`,
// the shared infra catch-all the presenter already maps.
const INFRA_FAILURE: BankStatementReconciliationError = { code: "DatabaseError" };

/**
 * Inline create-account flow for the bank-statement import (BAS-013/014).
 * Calls the same `commands.createBankAccount` Tauri command as the bank-account
 * feature's own gateway, but lives inside this feature so we strictly respect
 * F23 (no cross-feature imports). The duplication is bounded — both wrappers
 * share the same shape because they wrap the same backend command.
 */
export async function createBankAccount(
  name: string,
  iban: string | null,
): Promise<ServiceResult<BankAccount, BankError>> {
  logger.info(TAG, "Creating bank account", { name, hasIban: iban !== null });

  const result = await commands.createBankAccount(name, iban);

  if (result.status === "error") {
    logger.error(TAG, "Failed to create bank account", { code: result.error.code });
    return { success: false, error: result.error };
  }

  return { success: true, data: result.data };
}

export async function parseBankStatement(
  filePath: string,
): Promise<ServiceResult<BankStatementParseResult, BankStatementReconciliationError>> {
  logger.info(TAG, "Parsing bank statement PDF");
  try {
    const result = await commands.parseBankStatement(filePath);
    if (result.status === "error") {
      logger.error(TAG, "Failed to parse bank statement", { code: result.error.code });
      return { success: false, error: result.error };
    }
    logger.info(TAG, `Parsed ${result.data.credit_lines.length} credit lines`);
    return { success: true, data: result.data };
  } catch (e) {
    logger.error(TAG, "parseBankStatement exception", { error: e });
    return { success: false, error: INFRA_FAILURE };
  }
}

export async function resolveBankAccountFromIban(
  iban: string,
): Promise<ServiceResult<BankAccount | null, BankStatementReconciliationError>> {
  logger.info(TAG, "Resolving bank account from IBAN");
  try {
    const result = await commands.resolveBankAccountFromIban(iban);
    if (result.status === "error") {
      logger.error(TAG, "Failed to resolve bank account", { code: result.error.code });
      return { success: false, error: result.error };
    }
    return { success: true, data: result.data };
  } catch (e) {
    logger.error(TAG, "resolveBankAccountFromIban exception", { error: e });
    return { success: false, error: INFRA_FAILURE };
  }
}

export async function resolveBankFundLabels(
  bankAccountId: string,
  labels: string[],
): Promise<ServiceResult<FundLabelResolution[], BankStatementReconciliationError>> {
  logger.info(TAG, "Resolving fund labels", { bankAccountId, labelCount: labels.length });
  try {
    const result = await commands.resolveBankFundLabels(bankAccountId, labels);
    if (result.status === "error") {
      logger.error(TAG, "Failed to resolve fund labels", { code: result.error.code });
      return { success: false, error: result.error };
    }
    return { success: true, data: result.data };
  } catch (e) {
    logger.error(TAG, "resolveBankFundLabels exception", { error: e });
    return { success: false, error: INFRA_FAILURE };
  }
}

export async function saveBankFundLabelMappings(
  bankAccountId: string,
  mappings: SaveLabelMappingRequest[],
): Promise<ServiceResult<void, BankStatementReconciliationError>> {
  logger.info(TAG, "Saving label mappings", { bankAccountId, count: mappings.length });
  try {
    const result = await commands.saveBankFundLabelMappings(bankAccountId, mappings);
    if (result.status === "error") {
      logger.error(TAG, "Failed to save label mappings", { code: result.error.code });
      return { success: false, error: result.error };
    }
    return { success: true, data: undefined };
  } catch (e) {
    logger.error(TAG, "saveBankFundLabelMappings exception", { error: e });
    return { success: false, error: INFRA_FAILURE };
  }
}

export async function matchBankStatementLines(
  resolvedLines: ResolvedCreditLine[],
): Promise<ServiceResult<BankStatementMatchResult, BankStatementReconciliationError>> {
  logger.info(TAG, "Matching bank statement lines", { lineCount: resolvedLines.length });
  try {
    const result = await commands.matchBankStatementLines(resolvedLines);
    if (result.status === "error") {
      logger.error(TAG, "Failed to match bank statement lines", { code: result.error.code });
      return { success: false, error: result.error };
    }
    logger.info(TAG, `Matched ${result.data.matched.length} lines`);
    return { success: true, data: result.data };
  } catch (e) {
    logger.error(TAG, "matchBankStatementLines exception", { error: e });
    return { success: false, error: INFRA_FAILURE };
  }
}

export async function createBankTransfersFromStatement(
  bankAccountId: string,
  confirmedMatches: ConfirmedMatch[],
): Promise<ServiceResult<number, BankStatementReconciliationError>> {
  logger.info(TAG, "Creating bank transfers", {
    bankAccountId,
    matchCount: confirmedMatches.length,
  });
  try {
    const result = await commands.createBankTransfersFromStatement(bankAccountId, confirmedMatches);
    if (result.status === "error") {
      logger.error(TAG, "Failed to create bank transfers", { code: result.error.code });
      return { success: false, error: result.error };
    }
    logger.info(TAG, `Created ${result.data} bank transfers`);
    return { success: true, data: result.data };
  } catch (e) {
    logger.error(TAG, "createBankTransfersFromStatement exception", { error: e });
    return { success: false, error: INFRA_FAILURE };
  }
}

export async function getBankStatementReconciliationConfig(): Promise<BankStatementReconciliationConfig> {
  logger.info(TAG, "Fetching bank statement reconciliation config");

  // This command returns the config directly (not Result<T,E>), so no status check needed.
  const config = await commands.getBankStatementReconciliationConfig();

  logger.info(TAG, "Config fetched", config);
  return config;
}
