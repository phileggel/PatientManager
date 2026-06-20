import {
  type BankAccount,
  type BankError,
  type BankStatementCorrection,
  type BankStatementParseResult,
  type BankStatementReconciliation,
  type BankStatementReconciliationError,
  commands,
} from "@/bindings";
import { logger } from "@/infra/logger";

import type { ServiceResult } from "@/types/api";

const TAG = "[BankStatementGateway]";

// A thrown IPC/serialization failure (the binding only throws on a genuine JS
// `Error`; typed backend errors return as a `status: "error"` Result) is an
// infrastructure failure with no domain meaning — surface it as `DatabaseError`,
// the shared infra catch-all the presenter already maps.
const INFRA_FAILURE: BankStatementReconciliationError = { code: "DatabaseError" };

// Same infra catch-all, typed as `BankError` for the create-account wrapper
// (which surfaces the bank context's own error enum).
const BANK_INFRA_FAILURE: BankError = { code: "DatabaseError" };

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

  try {
    const result = await commands.createBankAccount(name, iban);
    if (result.status === "error") {
      logger.error(TAG, "Failed to create bank account", { code: result.error.code });
      return { success: false, error: result.error };
    }
    return { success: true, data: result.data };
  } catch (e) {
    logger.error(TAG, "createBankAccount exception", { error: e });
    return { success: false, error: BANK_INFRA_FAILURE };
  }
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

/**
 * BAS-064 — recompute the draft reconciliation from the parse result + the
 * accumulated corrections list. Pure read-model: no writes. Passes the typed
 * Result through unchanged (F27 layer 1); a genuine IPC throw maps to the
 * shared `DatabaseError` infra sentinel.
 */
export async function computeBankStatementReconciliation(
  bankAccountId: string,
  parseResult: BankStatementParseResult,
  corrections: BankStatementCorrection[],
): Promise<ServiceResult<BankStatementReconciliation, BankStatementReconciliationError>> {
  logger.info(TAG, "Computing bank statement reconciliation", {
    bankAccountId,
    correctionCount: corrections.length,
  });
  try {
    const result = await commands.computeBankStatementReconciliation(
      bankAccountId,
      parseResult,
      corrections,
    );
    if (result.status === "error") {
      logger.error(TAG, "Failed to compute reconciliation", { code: result.error.code });
      return { success: false, error: result.error };
    }
    return { success: true, data: result.data };
  } catch (e) {
    logger.error(TAG, "computeBankStatementReconciliation exception", { error: e });
    return { success: false, error: INFRA_FAILURE };
  }
}

/**
 * BAS-063/093 — commit the reconciliation. Recomputes server-side from the
 * corrections list, writes the bank entries, and returns the count created.
 * Passes the typed Result through unchanged (F27 layer 1); a genuine IPC throw
 * maps to the shared `DatabaseError` infra sentinel.
 */
export async function validateBankStatementReconciliation(
  bankAccountId: string,
  parseResult: BankStatementParseResult,
  corrections: BankStatementCorrection[],
): Promise<ServiceResult<number, BankStatementReconciliationError>> {
  logger.info(TAG, "Validating bank statement reconciliation", {
    bankAccountId,
    correctionCount: corrections.length,
  });
  try {
    const result = await commands.validateBankStatementReconciliation(
      bankAccountId,
      parseResult,
      corrections,
    );
    if (result.status === "error") {
      logger.error(TAG, "Failed to validate reconciliation", { code: result.error.code });
      return { success: false, error: result.error };
    }
    logger.info(TAG, `Validated reconciliation: ${result.data} bank entries created`);
    return { success: true, data: result.data };
  } catch (e) {
    logger.error(TAG, "validateBankStatementReconciliation exception", { error: e });
    return { success: false, error: INFRA_FAILURE };
  }
}
