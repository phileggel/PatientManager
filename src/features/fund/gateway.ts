import { commands, type Fund, type FundError } from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";
import { logger } from "@/infra/logger";
import type { ServiceResult } from "@/types/api";

export function readAllFunds(): ServiceResult<Fund[]> {
  logger.debug("Fetching all funds from store");
  const funds = useCacheStore.getState().funds;
  return { success: true, data: funds };
}

export async function addFund(
  fundIdentifier: string,
  fundName: string,
): Promise<ServiceResult<Fund, FundError>> {
  logger.info("Adding fund", { fundIdentifier, fundName });
  const result = await commands.addFund(fundIdentifier, fundName);
  if (result.status === "ok") {
    logger.info("Fund added successfully");
    return { success: true, data: result.data };
  }
  logger.error("Failed to add fund", { code: result.error.code });
  return { success: false, error: result.error };
}

export async function updateFund(fund: Fund): Promise<ServiceResult<Fund, FundError>> {
  logger.info("Updating fund");
  const result = await commands.updateFund(fund);
  if (result.status === "ok") {
    logger.info("Fund updated successfully");
    return { success: true, data: result.data };
  }
  logger.error("Failed to update fund", { code: result.error.code });
  return { success: false, error: result.error };
}

export async function deleteFund(id: string): Promise<ServiceResult<void, FundError>> {
  logger.info("Deleting fund", { fundId: id });
  const result = await commands.deleteFund(id);
  if (result.status === "ok") {
    logger.info("Fund deleted successfully", { fundId: id });
    return { success: true, data: undefined };
  }
  logger.error("Failed to delete fund", { code: result.error.code });
  return { success: false, error: result.error };
}
