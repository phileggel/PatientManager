import type {
  BankManualMatchResult,
  BankTransfer,
  BankTransferType,
  DirectPaymentProcedureCandidate,
  FundGroupCandidate,
} from "@/bindings";
import { commands } from "@/bindings";
import { logger } from "@/lib/logger";

export type ServiceResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ── Bank Transfer CRUD ──────────────────────────────────────────────────────

export async function createBankTransfer(
  transferDate: string,
  amount: number,
  transferType: BankTransferType,
  bankAccount: string,
): Promise<ServiceResult<BankTransfer>> {
  logger.info("[bank-transfer] createBankTransfer", { transferDate, amount, transferType });
  try {
    const result = await commands.createBankTransfer(
      transferDate,
      amount,
      transferType,
      bankAccount,
    );
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[bank-transfer] createBankTransfer failed", { error: result.error });
    return { success: false, error: result.error };
  } catch (error) {
    logger.error("[bank-transfer] createBankTransfer exception", { error });
    return { success: false, error: String(error) };
  }
}

export async function readAllBankTransfers(): Promise<ServiceResult<BankTransfer[]>> {
  logger.debug("[bank-transfer] readAllBankTransfers");
  try {
    const result = await commands.readAllBankTransfers();
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[bank-transfer] readAllBankTransfers failed", { error: result.error });
    return { success: false, error: result.error };
  } catch (error) {
    logger.error("[bank-transfer] readAllBankTransfers exception", { error });
    return { success: false, error: String(error) };
  }
}

export async function updateBankTransfer(
  transfer: BankTransfer,
): Promise<ServiceResult<BankTransfer>> {
  logger.info("[bank-transfer] updateBankTransfer", { id: transfer.id });
  try {
    const result = await commands.updateBankTransfer(transfer);
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[bank-transfer] updateBankTransfer failed", { error: result.error });
    return { success: false, error: result.error };
  } catch (error) {
    logger.error("[bank-transfer] updateBankTransfer exception", { error });
    return { success: false, error: String(error) };
  }
}

export async function deleteBankTransfer(id: string): Promise<ServiceResult<void>> {
  logger.info("[bank-transfer] deleteBankTransfer", { id });
  try {
    const result = await commands.deleteBankTransfer(id);
    if (result.status === "ok") return { success: true };
    logger.error("[bank-transfer] deleteBankTransfer failed", { error: result.error });
    return { success: false, error: result.error };
  } catch (error) {
    logger.error("[bank-transfer] deleteBankTransfer exception", { error });
    return { success: false, error: String(error) };
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
): Promise<ServiceResult<FundGroupCandidate[]>> {
  logger.debug("[bank-transfer] getUnsettledFundGroups", { transferDate });
  try {
    const result = await commands.getUnsettledFundGroups(transferDate);
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[bank-transfer] getUnsettledFundGroups failed", { error: result.error });
    return { success: false, error: result.error };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getAllUnsettledFundGroups(): Promise<ServiceResult<FundGroupCandidate[]>> {
  logger.debug("[bank-transfer] getAllUnsettledFundGroups");
  try {
    const result = await commands.getAllUnsettledFundGroups();
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[bank-transfer] getAllUnsettledFundGroups failed", { error: result.error });
    return { success: false, error: result.error };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getFundGroupsByIds(
  groupIds: string[],
): Promise<ServiceResult<FundGroupCandidate[]>> {
  logger.debug("[bank-transfer] getFundGroupsByIds", { count: groupIds.length });
  try {
    const result = await commands.getFundGroupsByIds(groupIds);
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[bank-transfer] getFundGroupsByIds failed", { error: result.error });
    return { success: false, error: result.error };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function createFundTransfer(
  bankAccountId: string,
  transferDate: string,
  groupIds: string[],
): Promise<ServiceResult<BankManualMatchResult>> {
  logger.info("[bank-transfer] createFundTransfer", { transferDate, groupCount: groupIds.length });
  try {
    const result = await commands.createFundTransfer(bankAccountId, transferDate, groupIds);
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[bank-transfer] createFundTransfer failed", { error: result.error });
    return { success: false, error: result.error };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function updateFundTransfer(
  transferId: string,
  newTransferDate: string,
  newGroupIds: string[],
): Promise<ServiceResult<BankManualMatchResult>> {
  logger.info("[bank-transfer] updateFundTransfer", { transferId });
  try {
    const result = await commands.updateFundTransfer(transferId, newTransferDate, newGroupIds);
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[bank-transfer] updateFundTransfer failed", { error: result.error });
    return { success: false, error: result.error };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function deleteFundTransfer(transferId: string): Promise<ServiceResult<void>> {
  logger.info("[bank-transfer] deleteFundTransfer", { transferId });
  try {
    const result = await commands.deleteFundTransfer(transferId);
    if (result.status === "ok") return { success: true };
    logger.error("[bank-transfer] deleteFundTransfer failed", { error: result.error });
    return { success: false, error: result.error };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getTransferFundGroupIds(
  transferId: string,
): Promise<ServiceResult<string[]>> {
  logger.debug("[bank-transfer] getTransferFundGroupIds", { transferId });
  try {
    const result = await commands.getTransferFundGroupIds(transferId);
    if (result.status === "ok") return { success: true, data: result.data };
    return { success: false, error: result.error };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Direct Payment Matching ─────────────────────────────────────────────────

export async function getEligibleProceduresForDirectPayment(
  paymentDate: string,
): Promise<ServiceResult<DirectPaymentProcedureCandidate[]>> {
  logger.debug("[bank-transfer] getEligibleProceduresForDirectPayment", { paymentDate });
  try {
    const result = await commands.getEligibleProceduresForDirectPayment(paymentDate);
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[bank-transfer] getEligibleProceduresForDirectPayment failed", {
      error: result.error,
    });
    return { success: false, error: result.error };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getAllEligibleProceduresForDirectPayment(): Promise<
  ServiceResult<DirectPaymentProcedureCandidate[]>
> {
  logger.debug("[bank-transfer] getAllEligibleProceduresForDirectPayment");
  try {
    const result = await commands.getAllEligibleProceduresForDirectPayment();
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[bank-transfer] getAllEligibleProceduresForDirectPayment failed", {
      error: result.error,
    });
    return { success: false, error: result.error };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getProceduresByIds(
  procedureIds: string[],
): Promise<ServiceResult<DirectPaymentProcedureCandidate[]>> {
  logger.debug("[bank-transfer] getProceduresByIds", { count: procedureIds.length });
  try {
    const result = await commands.getProceduresByIds(procedureIds);
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[bank-transfer] getProceduresByIds failed", { error: result.error });
    return { success: false, error: result.error };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function createDirectTransfer(
  bankAccountId: string,
  transferDate: string,
  transferType: BankTransferType,
  procedureIds: string[],
): Promise<ServiceResult<BankManualMatchResult>> {
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
    logger.error("[bank-transfer] createDirectTransfer failed", { error: result.error });
    return { success: false, error: result.error };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function updateDirectTransfer(
  transferId: string,
  newTransferDate: string,
  newProcedureIds: string[],
): Promise<ServiceResult<BankManualMatchResult>> {
  logger.info("[bank-transfer] updateDirectTransfer", { transferId });
  try {
    const result = await commands.updateDirectTransfer(
      transferId,
      newTransferDate,
      newProcedureIds,
    );
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[bank-transfer] updateDirectTransfer failed", { error: result.error });
    return { success: false, error: result.error };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function deleteDirectTransfer(transferId: string): Promise<ServiceResult<void>> {
  logger.info("[bank-transfer] deleteDirectTransfer", { transferId });
  try {
    const result = await commands.deleteDirectTransfer(transferId);
    if (result.status === "ok") return { success: true };
    logger.error("[bank-transfer] deleteDirectTransfer failed", { error: result.error });
    return { success: false, error: result.error };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getTransferProcedureIds(
  transferId: string,
): Promise<ServiceResult<string[]>> {
  logger.debug("[bank-transfer] getTransferProcedureIds", { transferId });
  try {
    const result = await commands.getTransferProcedureIds(transferId);
    if (result.status === "ok") return { success: true, data: result.data };
    return { success: false, error: result.error };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
