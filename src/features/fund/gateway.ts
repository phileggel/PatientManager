import { type AffiliatedFund, commands } from "@/bindings";
import { useAppStore } from "@/lib/appStore";
import { logger } from "@/lib/logger";
import type { ServiceResult } from "@/types/api";

export function readAllFunds(): ServiceResult<AffiliatedFund[]> {
  logger.debug("Fetching all funds from store");
  const funds = useAppStore.getState().funds;
  return { success: true, data: funds };
}

export async function addFund(
  fundIdentifier: string,
  fundName: string,
): Promise<ServiceResult<AffiliatedFund>> {
  logger.info("Adding fund", { fundIdentifier, fundName });

  const result = await commands.addFund(fundIdentifier, fundName);

  if (result.status === "ok") {
    logger.info("Fund added successfully");
    return { success: true, data: result.data };
  } else {
    logger.error("Failed to add fund", { error: result.error });
    return { success: false, error: result.error };
  }
}

export async function updateFund(fund: AffiliatedFund): Promise<ServiceResult<AffiliatedFund>> {
  logger.info("Updating fund");

  const result = await commands.updateFund(fund);

  if (result.status === "ok") {
    logger.info("Fund updated successfully");
    return { success: true, data: result.data };
  } else {
    logger.error("Failed to update fund", { error: result.error });
    return { success: false, error: result.error };
  }
}

export async function deleteFund(id: string): Promise<ServiceResult<void>> {
  logger.info("Deleting fund", { fundId: id });

  const result = await commands.deleteFund(id);

  if (result.status === "ok") {
    logger.info("Fund deleted successfully", { fundId: id });
    return { success: true, data: undefined };
  } else {
    logger.error("Failed to delete fund", { error: result.error });
    return { success: false, error: result.error };
  }
}
