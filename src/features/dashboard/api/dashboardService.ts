import * as procedureGateway from "@/features/procedure/api/gateway";
import { logger } from "@/infra/logger";
import type { ServiceResult } from "@/types/api";
import type { DashboardData } from "../types";

export async function fetchDashboardData(): Promise<ServiceResult<DashboardData>> {
  logger.info("Fetching dashboard data");

  const result = await procedureGateway.readAllProcedures();
  if (!result.success) {
    logger.error("Failed to fetch dashboard data", { error: result.error });
    return { success: false, error: result.error };
  }

  // Return raw procedures - aggregation happens in UI layer
  return { success: true, data: { procedures: result.data } };
}
