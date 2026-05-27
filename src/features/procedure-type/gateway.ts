import type { ProcedureError, ProcedureType } from "@/bindings";
import { commands } from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";
import { logger } from "@/infra/logger";
import type { ServiceResult } from "@/types/api";

export function readAllProcedureTypes(): ServiceResult<ProcedureType[]> {
  logger.debug("Fetching all procedure types from store");
  const procedureTypes = useCacheStore.getState().procedureTypes;
  return { success: true, data: procedureTypes };
}

/**
 * Fetches all procedure types from the backend; exposes the typed error so
 * callers can store it in the cache (per F27: gateway is pure pass-through;
 * translation happens at the consumer's render site via the feature presenter).
 */
export async function reloadProcedureTypes(): Promise<
  ServiceResult<ProcedureType[], ProcedureError>
> {
  logger.debug("Reloading procedure types from backend");
  const result = await commands.readAllProcedureTypes();
  if (result.status === "ok") {
    return { success: true, data: result.data };
  }
  logger.error("Failed to reload procedure types", { code: result.error.code });
  return { success: false, error: result.error };
}

export async function addProcedureType(
  name: string,
  defaultAmount: number,
  category?: string,
): Promise<ServiceResult<ProcedureType, ProcedureError>> {
  logger.info("Adding procedure type", { name, defaultAmount, category });
  const result = await commands.addProcedureType(name, defaultAmount, category || null);
  if (result.status === "ok") {
    logger.info("Procedure type added successfully", { typeId: result.data.id });
    return { success: true, data: result.data };
  }
  logger.error("Failed to add procedure type", { code: result.error.code });
  return { success: false, error: result.error };
}

export async function updateProcedureType(
  procedureType: ProcedureType,
): Promise<ServiceResult<ProcedureType, ProcedureError>> {
  logger.info("Updating procedure type", { typeId: procedureType.id, name: procedureType.name });
  const result = await commands.updateProcedureType(procedureType);
  if (result.status === "ok") {
    logger.info("Procedure type updated successfully");
    return { success: true, data: result.data };
  }
  logger.error("Failed to update procedure type", { code: result.error.code });
  return { success: false, error: result.error };
}

export async function deleteProcedureType(
  id: string,
): Promise<ServiceResult<void, ProcedureError>> {
  logger.info("Deleting procedure type", { typeId: id });
  const result = await commands.deleteProcedureType(id);
  if (result.status === "ok") {
    logger.info("Procedure type deleted successfully", { typeId: id });
    return { success: true, data: undefined };
  }
  logger.error("Failed to delete procedure type", { code: result.error.code });
  return { success: false, error: result.error };
}
