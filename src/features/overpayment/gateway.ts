import {
  type CancelOverpaymentRequest,
  type CreateOverpaymentRequest,
  commands,
  type ProcedureRefundInfo,
} from "@/bindings";
import { logger } from "@/infra/logger";
import type { ServiceResult } from "@/types";

export async function createOverpayment(
  request: CreateOverpaymentRequest,
): Promise<ServiceResult<null>> {
  logger.info("Creating overpayment refund", { source_procedure_id: request.source_procedure_id });
  try {
    const result = await commands.createOverpayment(request);
    if (result.status === "ok") {
      logger.info("Overpayment refund created", {
        source_procedure_id: request.source_procedure_id,
      });
      return { success: true, data: null };
    }
    logger.error("Failed to create overpayment refund", { error: result.error });
    return { success: false, error: result.error };
  } catch (error) {
    logger.error("Exception creating overpayment refund", { error });
    return { success: false, error: String(error) };
  }
}

export async function cancelOverpayment(
  request: CancelOverpaymentRequest,
): Promise<ServiceResult<null>> {
  logger.info("Cancelling overpayment refund", {
    source_procedure_id: request.source_procedure_id,
  });
  try {
    const result = await commands.cancelOverpayment(request);
    if (result.status === "ok") {
      logger.info("Overpayment refund cancelled", {
        source_procedure_id: request.source_procedure_id,
      });
      return { success: true, data: null };
    }
    logger.error("Failed to cancel overpayment refund", { error: result.error });
    return { success: false, error: result.error };
  } catch (error) {
    logger.error("Exception cancelling overpayment refund", { error });
    return { success: false, error: String(error) };
  }
}

export async function getProcedureRefundBySource(
  sourceProcedureId: string,
): Promise<ServiceResult<ProcedureRefundInfo | null>> {
  logger.debug("Fetching procedure refund by source", { sourceProcedureId });
  try {
    const result = await commands.getProcedureRefundBySource(sourceProcedureId);
    if (result.status === "ok") {
      return { success: true, data: result.data };
    }
    logger.error("Failed to fetch procedure refund", { error: result.error });
    return { success: false, error: result.error };
  } catch (error) {
    logger.error("Exception fetching procedure refund", { error });
    return { success: false, error: String(error) };
  }
}

export async function getProcedureRefundByRefundProcedure(
  refundProcedureId: string,
): Promise<ServiceResult<ProcedureRefundInfo | null>> {
  logger.debug("Fetching procedure refund by refund procedure", { refundProcedureId });
  try {
    const result = await commands.getProcedureRefundByRefundProcedure(refundProcedureId);
    if (result.status === "ok") {
      return { success: true, data: result.data };
    }
    logger.error("Failed to fetch procedure refund by refund procedure", { error: result.error });
    return { success: false, error: result.error };
  } catch (error) {
    logger.error("Exception fetching procedure refund by refund procedure", { error });
    return { success: false, error: String(error) };
  }
}
