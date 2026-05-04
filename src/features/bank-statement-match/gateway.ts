import { readFile } from "@tauri-apps/plugin-fs";
import {
  type BankAccount,
  type BankStatementMatchResult,
  type BankStatementParseResult,
  type BankStatementReconciliationConfig,
  type ConfirmedMatch,
  commands,
  type FundLabelResolution,
  type ResolvedCreditLine,
  type SaveLabelMappingRequest,
} from "@/bindings";
import { logger } from "@/lib/logger";

// Re-export for the inline-create flow (BAS-013/014). The bank-account aggregate
// owns the command; this re-export keeps the cross-context dependency explicit
// and contained inside the feature gateway, so hooks/components stay within the
// `bank-statement-match` import boundary.
export { createBankAccount } from "@/features/bank-account/gateway";

const TAG = "[BankStatementGateway]";

export async function parseBankStatement(filePath: string): Promise<BankStatementParseResult> {
  logger.info(TAG, "Parsing bank statement PDF", { filePath });

  const fileBytes = await readFile(filePath);
  const bytes = Array.from(fileBytes);

  const result = await commands.parseBankStatement(bytes);

  if (result.status === "error") {
    logger.error(TAG, "Failed to parse bank statement", result.error);
    throw new Error(result.error);
  }

  if (!result.data) {
    logger.error(TAG, "Backend returned null data", { result });
    throw new Error("Backend returned no data");
  }

  logger.info(TAG, `Parsed ${result.data.credit_lines.length} credit lines`);
  return result.data;
}

export async function resolveBankAccountFromIban(iban: string): Promise<BankAccount | null> {
  logger.info(TAG, "Resolving bank account from IBAN", { iban });

  const result = await commands.resolveBankAccountFromIban(iban);

  if (result.status === "error") {
    logger.error(TAG, "Failed to resolve bank account", result.error);
    throw new Error(result.error);
  }

  return result.data;
}

export async function resolveBankFundLabels(
  bankAccountId: string,
  labels: string[],
): Promise<FundLabelResolution[]> {
  logger.info(TAG, "Resolving fund labels", { bankAccountId, labelCount: labels.length });

  const result = await commands.resolveBankFundLabels(bankAccountId, labels);

  if (result.status === "error") {
    logger.error(TAG, "Failed to resolve fund labels", result.error);
    throw new Error(result.error);
  }

  return result.data;
}

export async function saveBankFundLabelMappings(
  bankAccountId: string,
  mappings: SaveLabelMappingRequest[],
): Promise<void> {
  logger.info(TAG, "Saving label mappings", { bankAccountId, count: mappings.length });

  const result = await commands.saveBankFundLabelMappings(bankAccountId, mappings);

  if (result.status === "error") {
    logger.error(TAG, "Failed to save label mappings", result.error);
    throw new Error(result.error);
  }
}

export async function matchBankStatementLines(
  resolvedLines: ResolvedCreditLine[],
): Promise<BankStatementMatchResult> {
  logger.info(TAG, "Matching bank statement lines", { lineCount: resolvedLines.length });

  const result = await commands.matchBankStatementLines(resolvedLines);

  if (result.status === "error") {
    logger.error(TAG, "Failed to match bank statement lines", result.error);
    throw new Error(result.error);
  }

  logger.info(TAG, `Matched ${result.data.matched.length} lines`);
  return result.data;
}

export async function createBankTransfersFromStatement(
  bankAccountId: string,
  confirmedMatches: ConfirmedMatch[],
): Promise<number> {
  logger.info(TAG, "Creating bank transfers", {
    bankAccountId,
    matchCount: confirmedMatches.length,
  });

  const result = await commands.createBankTransfersFromStatement(bankAccountId, confirmedMatches);

  if (result.status === "error") {
    logger.error(TAG, "Failed to create bank transfers", result.error);
    throw new Error(result.error);
  }

  logger.info(TAG, `Created ${result.data} bank transfers`);
  return result.data;
}

export async function getBankStatementReconciliationConfig(): Promise<BankStatementReconciliationConfig> {
  logger.info(TAG, "Fetching bank statement reconciliation config");

  // This command returns the config directly (not Result<T,E>), so no status check needed.
  const config = await commands.getBankStatementReconciliationConfig();

  logger.info(TAG, "Config fetched", config);
  return config;
}
