import type {
  BankEntry,
  BankEntryType,
  BankError,
  BankManualMatchError,
  BankManualMatchResult,
  DirectPaymentProcedureCandidate,
  FundGroupCandidate,
} from "@/bindings";
import { commands } from "@/bindings";
import { logger } from "@/infra/logger";
import type { ServiceResult } from "@/types/api";

// A thrown IPC/serialization failure (the binding only throws on a genuine JS
// `Error`; typed backend errors come back as a `status: "error"` Result) is an
// infrastructure failure with no domain meaning — surface it as `DatabaseError`,
// the shared infra catch-all the presenter already maps.
const INFRA_FAILURE: BankManualMatchError = { code: "DatabaseError" };

// ── Bank Transfer CRUD ──────────────────────────────────────────────────────

export async function createBankTransfer(
  transferDate: string,
  amount: number,
  transferType: BankEntryType,
  bankAccount: string,
): Promise<ServiceResult<BankEntry, BankError>> {
  logger.info("[bank-transfer] createBankTransfer", { transferDate, amount, transferType });
  const result = await commands.createBankTransfer(transferDate, amount, transferType, bankAccount);
  if (result.status === "ok") return { success: true, data: result.data };
  logger.error("[bank-transfer] createBankTransfer failed", { code: result.error.code });
  return { success: false, error: result.error };
}

export async function readAllBankTransfers(): Promise<ServiceResult<BankEntry[], BankError>> {
  logger.debug("[bank-transfer] readAllBankTransfers");
  const result = await commands.readAllBankTransfers();
  if (result.status === "ok") return { success: true, data: result.data };
  logger.error("[bank-transfer] readAllBankTransfers failed", { code: result.error.code });
  return { success: false, error: result.error };
}

export async function updateBankTransfer(
  transfer: BankEntry,
): Promise<ServiceResult<BankEntry, BankError>> {
  logger.info("[bank-transfer] updateBankTransfer", { id: transfer.id });
  const result = await commands.updateBankTransfer(transfer);
  if (result.status === "ok") return { success: true, data: result.data };
  logger.error("[bank-transfer] updateBankTransfer failed", { code: result.error.code });
  return { success: false, error: result.error };
}

export async function deleteTransferByType(
  transfer: BankEntry,
): Promise<ServiceResult<void, BankManualMatchError>> {
  logger.info("[bank-transfer] deleteTransferByType", {
    id: transfer.id,
    type: transfer.transfer_type,
  });
  switch (transfer.transfer_type) {
    case "FUND_WIRE":
    case "FUND_OUTGOING_WIRE":
      return deleteFundTransfer(transfer.id);
    case "PATIENT_CHECK":
    case "PATIENT_CREDIT_CARD":
    case "PATIENT_CASH":
      return deleteDirectTransfer(transfer.id);
    default: {
      // Unreachable: the switch is exhaustive over BankEntryType. The `never`
      // binding turns any future variant into a compile error here.
      const unhandled: never = transfer.transfer_type;
      logger.error("[bank-transfer] deleteTransferByType: unhandled type", { type: unhandled });
      return { success: false, error: { code: "WrongTransferType" } };
    }
  }
}

export async function getCashBankAccountId(): Promise<ServiceResult<string>> {
  logger.debug("[bank-transfer] getCashBankAccountId");
  try {
    const id = await commands.getCashBankAccountId();
    if (!id) return { success: false, error: "Cash account id is empty" };
    logger.debug("[bank-transfer] getCashBankAccountId fetched", { id });
    return { success: true, data: id };
  } catch (error) {
    logger.error("[bank-transfer] getCashBankAccountId exception", { error });
    return { success: false, error: String(error) };
  }
}

// ── Fund Group Matching ─────────────────────────────────────────────────────

export async function getUnsettledFundGroups(
  transferDate: string,
): Promise<ServiceResult<FundGroupCandidate[], BankManualMatchError>> {
  logger.debug("[bank-transfer] getUnsettledFundGroups", { transferDate });
  try {
    const result = await commands.getUnsettledFundGroups(transferDate);
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[bank-transfer] getUnsettledFundGroups failed", { code: result.error.code });
    return { success: false, error: result.error };
  } catch (e) {
    logger.error("[bank-transfer] getUnsettledFundGroups exception", { error: e });
    return { success: false, error: INFRA_FAILURE };
  }
}

export async function getAllUnsettledFundGroups(): Promise<
  ServiceResult<FundGroupCandidate[], BankManualMatchError>
> {
  logger.debug("[bank-transfer] getAllUnsettledFundGroups");
  try {
    const result = await commands.getAllUnsettledFundGroups();
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[bank-transfer] getAllUnsettledFundGroups failed", { code: result.error.code });
    return { success: false, error: result.error };
  } catch (e) {
    logger.error("[bank-transfer] getAllUnsettledFundGroups exception", { error: e });
    return { success: false, error: INFRA_FAILURE };
  }
}

export async function getFundGroupsByIds(
  groupIds: string[],
): Promise<ServiceResult<FundGroupCandidate[], BankManualMatchError>> {
  logger.debug("[bank-transfer] getFundGroupsByIds", { count: groupIds.length });
  try {
    const result = await commands.getFundGroupsByIds(groupIds);
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[bank-transfer] getFundGroupsByIds failed", { code: result.error.code });
    return { success: false, error: result.error };
  } catch (e) {
    logger.error("[bank-transfer] getFundGroupsByIds exception", { error: e });
    return { success: false, error: INFRA_FAILURE };
  }
}

export async function createFundTransfer(
  bankAccountId: string,
  transferDate: string,
  groupIds: string[],
): Promise<ServiceResult<BankManualMatchResult, BankManualMatchError>> {
  logger.info("[bank-transfer] createFundTransfer", { transferDate, groupCount: groupIds.length });
  try {
    const result = await commands.createFundTransfer(bankAccountId, transferDate, groupIds);
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[bank-transfer] createFundTransfer failed", { code: result.error.code });
    return { success: false, error: result.error };
  } catch (e) {
    logger.error("[bank-transfer] createFundTransfer exception", { error: e });
    return { success: false, error: INFRA_FAILURE };
  }
}

export async function updateFundTransfer(
  transferId: string,
  newTransferDate: string,
  newGroupIds: string[],
): Promise<ServiceResult<BankManualMatchResult, BankManualMatchError>> {
  logger.info("[bank-transfer] updateFundTransfer", { transferId });
  try {
    const result = await commands.updateFundTransfer(transferId, newTransferDate, newGroupIds);
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[bank-transfer] updateFundTransfer failed", { code: result.error.code });
    return { success: false, error: result.error };
  } catch (e) {
    logger.error("[bank-transfer] updateFundTransfer exception", { error: e });
    return { success: false, error: INFRA_FAILURE };
  }
}

async function deleteFundTransfer(
  transferId: string,
): Promise<ServiceResult<void, BankManualMatchError>> {
  logger.info("[bank-transfer] deleteFundTransfer", { transferId });
  try {
    const result = await commands.deleteFundTransfer(transferId);
    if (result.status === "ok") return { success: true, data: undefined };
    logger.error("[bank-transfer] deleteFundTransfer failed", { code: result.error.code });
    return { success: false, error: result.error };
  } catch (e) {
    logger.error("[bank-transfer] deleteFundTransfer exception", { error: e });
    return { success: false, error: INFRA_FAILURE };
  }
}

export async function getTransferFundGroupIds(
  transferId: string,
): Promise<ServiceResult<string[], BankManualMatchError>> {
  logger.debug("[bank-transfer] getTransferFundGroupIds", { transferId });
  try {
    const result = await commands.getTransferFundGroupIds(transferId);
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[bank-transfer] getTransferFundGroupIds failed", { code: result.error.code });
    return { success: false, error: result.error };
  } catch (e) {
    logger.error("[bank-transfer] getTransferFundGroupIds exception", { error: e });
    return { success: false, error: INFRA_FAILURE };
  }
}

// ── Direct Payment Matching ─────────────────────────────────────────────────

export async function getEligibleProceduresForDirectPayment(
  paymentDate: string,
): Promise<ServiceResult<DirectPaymentProcedureCandidate[], BankManualMatchError>> {
  logger.debug("[bank-transfer] getEligibleProceduresForDirectPayment", { paymentDate });
  try {
    const result = await commands.getEligibleProceduresForDirectPayment(paymentDate);
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[bank-transfer] getEligibleProceduresForDirectPayment failed", {
      code: result.error.code,
    });
    return { success: false, error: result.error };
  } catch (e) {
    logger.error("[bank-transfer] getEligibleProceduresForDirectPayment exception", { error: e });
    return { success: false, error: INFRA_FAILURE };
  }
}

export async function getAllEligibleProceduresForDirectPayment(): Promise<
  ServiceResult<DirectPaymentProcedureCandidate[], BankManualMatchError>
> {
  logger.debug("[bank-transfer] getAllEligibleProceduresForDirectPayment");
  try {
    const result = await commands.getAllEligibleProceduresForDirectPayment();
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[bank-transfer] getAllEligibleProceduresForDirectPayment failed", {
      code: result.error.code,
    });
    return { success: false, error: result.error };
  } catch (e) {
    logger.error("[bank-transfer] getAllEligibleProceduresForDirectPayment exception", {
      error: e,
    });
    return { success: false, error: INFRA_FAILURE };
  }
}

export async function getProceduresByIds(
  procedureIds: string[],
): Promise<ServiceResult<DirectPaymentProcedureCandidate[], BankManualMatchError>> {
  logger.debug("[bank-transfer] getProceduresByIds", { count: procedureIds.length });
  try {
    const result = await commands.getProceduresByIds(procedureIds);
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[bank-transfer] getProceduresByIds failed", { code: result.error.code });
    return { success: false, error: result.error };
  } catch (e) {
    logger.error("[bank-transfer] getProceduresByIds exception", { error: e });
    return { success: false, error: INFRA_FAILURE };
  }
}

export async function createDirectTransfer(
  bankAccountId: string,
  transferDate: string,
  transferType: BankEntryType,
  procedureIds: string[],
): Promise<ServiceResult<BankManualMatchResult, BankManualMatchError>> {
  logger.info("[bank-transfer] createDirectTransfer", {
    transferDate,
    type: transferType,
    count: procedureIds.length,
  });
  try {
    const result = await commands.createDirectTransfer(
      bankAccountId,
      transferDate,
      transferType,
      procedureIds,
    );
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[bank-transfer] createDirectTransfer failed", { code: result.error.code });
    return { success: false, error: result.error };
  } catch (e) {
    logger.error("[bank-transfer] createDirectTransfer exception", { error: e });
    return { success: false, error: INFRA_FAILURE };
  }
}

export async function updateDirectTransfer(
  transferId: string,
  newTransferDate: string,
  newProcedureIds: string[],
): Promise<ServiceResult<BankManualMatchResult, BankManualMatchError>> {
  logger.info("[bank-transfer] updateDirectTransfer", { transferId });
  try {
    const result = await commands.updateDirectTransfer(
      transferId,
      newTransferDate,
      newProcedureIds,
    );
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[bank-transfer] updateDirectTransfer failed", { code: result.error.code });
    return { success: false, error: result.error };
  } catch (e) {
    logger.error("[bank-transfer] updateDirectTransfer exception", { error: e });
    return { success: false, error: INFRA_FAILURE };
  }
}

async function deleteDirectTransfer(
  transferId: string,
): Promise<ServiceResult<void, BankManualMatchError>> {
  logger.info("[bank-transfer] deleteDirectTransfer", { transferId });
  try {
    const result = await commands.deleteDirectTransfer(transferId);
    if (result.status === "ok") return { success: true, data: undefined };
    logger.error("[bank-transfer] deleteDirectTransfer failed", { code: result.error.code });
    return { success: false, error: result.error };
  } catch (e) {
    logger.error("[bank-transfer] deleteDirectTransfer exception", { error: e });
    return { success: false, error: INFRA_FAILURE };
  }
}

export async function getTransferProcedureIds(
  transferId: string,
): Promise<ServiceResult<string[], BankManualMatchError>> {
  logger.debug("[bank-transfer] getTransferProcedureIds", { transferId });
  try {
    const result = await commands.getTransferProcedureIds(transferId);
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[bank-transfer] getTransferProcedureIds failed", { code: result.error.code });
    return { success: false, error: result.error };
  } catch (e) {
    logger.error("[bank-transfer] getTransferProcedureIds exception", { error: e });
    return { success: false, error: INFRA_FAILURE };
  }
}
