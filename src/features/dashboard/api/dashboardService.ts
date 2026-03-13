import * as procedureGateway from "@/features/procedure/api/gateway";
import { logger } from "@/lib/logger";
import type { ServiceResult } from "@/types/api";
import type { DashboardData } from "../types";

export async function fetchDashboardData(): Promise<ServiceResult<DashboardData>> {
  logger.info("Fetching dashboard data");

  try {
    const procedures = await procedureGateway.readAllProcedures();

    // Return raw procedures - aggregation happens in UI layer
    return {
      success: true,
      data: {
        procedures,
      },
    };
  } catch (error) {
    logger.error("Failed to fetch dashboard data", { error });
    return { success: false, error: String(error) };
  }
}
