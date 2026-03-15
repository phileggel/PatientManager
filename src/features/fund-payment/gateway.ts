import {
  commands,
  type FundPaymentGroup,
  type FundPaymentGroupEditData,
  type Procedure,
} from "@/bindings";
import { logger } from "@/lib/logger";
import type { ServiceResult } from "@/types";

export async function getUnpaidProceduresByFund(
  fundId: string,
): Promise<ServiceResult<Procedure[]>> {
  logger.debug("Fetching unpaid procedures by fund", { fundId });
  try {
    const result = await commands.getUnpaidProceduresByFund(fundId);

    if (result.status === "ok") {
      logger.info("Unpaid procedures fetched", { fundId, count: result.data.length });
      return { success: true, data: result.data };
    } else {
      logger.error("Failed to fetch unpaid procedures", { error: result.error });
      return { success: false, error: result.error };
    }
  } catch (error) {
    logger.error("Exception fetching unpaid procedures", { error });
    return { success: false, error: String(error) };
  }
}

export async function createFundPayment(
  fundId: string,
  paymentDate: string,
  selectedProcedures: Procedure[],
): Promise<ServiceResult<FundPaymentGroup>> {
  logger.info("Creating payment group with selected procedures", {
    fundId,
    paymentDate,
    count: selectedProcedures.length,
  });

  try {
    const result = await commands.createFundPaymentGroup(
      fundId,
      paymentDate,
      selectedProcedures.map((p) => p.id),
    );

    if (result.status === "ok") {
      logger.info("Payment group created", {
        id: result.data.id,
        count: selectedProcedures.length,
      });
      return { success: true, data: result.data };
    } else {
      logger.error("Failed to create payment group", { error: result.error });
      return { success: false, error: result.error };
    }
  } catch (error) {
    logger.error("Exception creating payment group", { error });
    return { success: false, error: String(error) };
  }
}

export async function deleteFundPaymentGroup(groupId: string): Promise<ServiceResult<void>> {
  logger.info("Deleting fund payment group", { groupId });
  try {
    const result = await commands.deleteFundPaymentGroup(groupId);

    if (result.status === "ok") {
      logger.info("Fund payment group deleted", { groupId });
      return { success: true, data: undefined };
    } else {
      logger.error("Failed to delete fund payment group", {
        error: result.error,
      });
      return { success: false, error: result.error };
    }
  } catch (error) {
    logger.error("Exception deleting fund payment group", { error });
    return { success: false, error: String(error) };
  }
}

export async function updatePaymentGroupWithProcedures(
  groupId: string,
  paymentDate: string,
  selectedProcedures: Procedure[],
): Promise<ServiceResult<FundPaymentGroup>> {
  logger.info("Updating payment group with selected procedures", {
    groupId,
    paymentDate,
    count: selectedProcedures.length,
  });

  try {
    const result = await commands.updateFundPaymentGroupWithProcedures(
      groupId,
      paymentDate,
      selectedProcedures.map((p) => p.id),
    );

    if (result.status === "ok") {
      logger.info("Payment group updated via orchestrator", {
        id: result.data.id,
        count: selectedProcedures.length,
      });
      return { success: true, data: result.data };
    } else {
      logger.error("Failed to update payment group", { error: result.error });
      return { success: false, error: result.error };
    }
  } catch (error) {
    logger.error("Exception updating payment group", { error });
    return { success: false, error: String(error) };
  }
}

export async function getFundPaymentGroupEditData(
  groupId: string,
  fundId: string,
): Promise<ServiceResult<FundPaymentGroupEditData>> {
  logger.debug("Fetching fund payment group edit data", { groupId, fundId });
  try {
    const result = await commands.getFundPaymentGroupEditData(groupId, fundId);

    if (result.status === "ok") {
      logger.info("Fund payment group edit data fetched", {
        groupId,
        currentCount: result.data.current_procedures.length,
        availableCount: result.data.available_procedures.length,
      });
      return { success: true, data: result.data };
    } else {
      logger.error("Failed to fetch fund payment group edit data", { error: result.error });
      return { success: false, error: result.error };
    }
  } catch (error) {
    logger.error("Exception fetching fund payment group edit data", { error });
    return { success: false, error: String(error) };
  }
}
