import type {
  BankManualMatchResult,
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

export async function getUnsettledFundGroups(
  transferDate: string,
): Promise<ServiceResult<FundGroupCandidate[]>> {
  logger.debug("[manual_match] getUnsettledFundGroups", { transferDate });
  try {
    const result = await commands.getUnsettledFundGroups(transferDate);
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[manual_match] getUnsettledFundGroups failed", { error: result.error });
    return { success: false, error: result.error };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getAllUnsettledFundGroups(): Promise<ServiceResult<FundGroupCandidate[]>> {
  logger.debug("[manual_match] getAllUnsettledFundGroups");
  try {
    const result = await commands.getAllUnsettledFundGroups();
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[manual_match] getAllUnsettledFundGroups failed", { error: result.error });
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
  logger.info("[manual_match] createFundTransfer", { transferDate, groupCount: groupIds.length });
  try {
    const result = await commands.createFundTransfer(bankAccountId, transferDate, groupIds);
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[manual_match] createFundTransfer failed", { error: result.error });
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
  logger.info("[manual_match] updateFundTransfer", { transferId });
  try {
    const result = await commands.updateFundTransfer(transferId, newTransferDate, newGroupIds);
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[manual_match] updateFundTransfer failed", { error: result.error });
    return { success: false, error: result.error };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function deleteFundTransfer(transferId: string): Promise<ServiceResult<void>> {
  logger.info("[manual_match] deleteFundTransfer", { transferId });
  try {
    const result = await commands.deleteFundTransfer(transferId);
    if (result.status === "ok") return { success: true };
    logger.error("[manual_match] deleteFundTransfer failed", { error: result.error });
    return { success: false, error: result.error };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getEligibleProceduresForDirectPayment(
  paymentDate: string,
): Promise<ServiceResult<DirectPaymentProcedureCandidate[]>> {
  logger.debug("[manual_match] getEligibleProceduresForDirectPayment", { paymentDate });
  try {
    const result = await commands.getEligibleProceduresForDirectPayment(paymentDate);
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[manual_match] getEligibleProceduresForDirectPayment failed", {
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
  logger.debug("[manual_match] getAllEligibleProceduresForDirectPayment");
  try {
    const result = await commands.getAllEligibleProceduresForDirectPayment();
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[manual_match] getAllEligibleProceduresForDirectPayment failed", {
      error: result.error,
    });
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
  logger.info("[manual_match] createDirectTransfer", {
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
    logger.error("[manual_match] createDirectTransfer failed", { error: result.error });
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
  logger.info("[manual_match] updateDirectTransfer", { transferId });
  try {
    const result = await commands.updateDirectTransfer(
      transferId,
      newTransferDate,
      newProcedureIds,
    );
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[manual_match] updateDirectTransfer failed", { error: result.error });
    return { success: false, error: result.error };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function deleteDirectTransfer(transferId: string): Promise<ServiceResult<void>> {
  logger.info("[manual_match] deleteDirectTransfer", { transferId });
  try {
    const result = await commands.deleteDirectTransfer(transferId);
    if (result.status === "ok") return { success: true };
    logger.error("[manual_match] deleteDirectTransfer failed", { error: result.error });
    return { success: false, error: result.error };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getFundGroupsByIds(
  groupIds: string[],
): Promise<ServiceResult<FundGroupCandidate[]>> {
  logger.debug("[manual_match] getFundGroupsByIds", { count: groupIds.length });
  try {
    const result = await commands.getFundGroupsByIds(groupIds);
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[manual_match] getFundGroupsByIds failed", { error: result.error });
    return { success: false, error: result.error };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getProceduresByIds(
  procedureIds: string[],
): Promise<ServiceResult<DirectPaymentProcedureCandidate[]>> {
  logger.debug("[manual_match] getProceduresByIds", { count: procedureIds.length });
  try {
    const result = await commands.getProceduresByIds(procedureIds);
    if (result.status === "ok") return { success: true, data: result.data };
    logger.error("[manual_match] getProceduresByIds failed", { error: result.error });
    return { success: false, error: result.error };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getTransferFundGroupIds(
  transferId: string,
): Promise<ServiceResult<string[]>> {
  try {
    const result = await commands.getTransferFundGroupIds(transferId);
    if (result.status === "ok") return { success: true, data: result.data };
    return { success: false, error: result.error };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getTransferProcedureIds(
  transferId: string,
): Promise<ServiceResult<string[]>> {
  try {
    const result = await commands.getTransferProcedureIds(transferId);
    if (result.status === "ok") return { success: true, data: result.data };
    return { success: false, error: result.error };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
