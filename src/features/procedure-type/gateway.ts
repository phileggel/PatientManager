import type { ProcedureType } from "@/bindings";
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
 * Fetches all procedure types from the backend.
 * Callers are responsible for writing the result back to the store
 * (e.g. via setProcedureTypes / setProcedureTypesError).
 */
export async function reloadProcedureTypes(): Promise<ServiceResult<ProcedureType[]>> {
  logger.debug("Reloading procedure types from backend");
  const result = await commands.readAllProcedureTypes();
  if (result.status === "ok") {
    return { success: true, data: result.data };
  }
  logger.error("Failed to reload procedure types", { error: result.error });
  return { success: false, error: result.error };
}

export async function addProcedureType(
  name: string,
  defaultAmount: number,
  category?: string,
): Promise<ServiceResult<ProcedureType>> {
  logger.info("Adding procedure type", { name, defaultAmount, category });

  const result = await commands.addProcedureType(name, defaultAmount, category || null);

  if (result.status === "ok") {
    logger.info("Procedure type added successfully", { typeId: result.data.id });
    return { success: true, data: result.data };
  } else {
    logger.error("Failed to add procedure type", { error: result.error });
    return { success: false, error: result.error };
  }
}

export async function updateProcedureType(
  procedureType: ProcedureType,
): Promise<ServiceResult<ProcedureType>> {
  logger.info("Updating procedure type", { typeId: procedureType.id, name: procedureType.name });

  const result = await commands.updateProcedureType(procedureType);

  if (result.status === "ok") {
    logger.info("Procedure type updated successfully");
    return { success: true, data: result.data };
  } else {
    logger.error("Failed to update procedure type", { error: result.error });
    return { success: false, error: result.error };
  }
}

export async function deleteProcedureType(id: string): Promise<ServiceResult<void>> {
  logger.info("Deleting procedure type", { typeId: id });

  const result = await commands.deleteProcedureType(id);

  if (result.status === "ok") {
    logger.info("Procedure type deleted successfully", { typeId: id });
    return { success: true, data: undefined };
  } else {
    logger.error("Failed to delete procedure type", { error: result.error });
    return { success: false, error: result.error };
  }
}
