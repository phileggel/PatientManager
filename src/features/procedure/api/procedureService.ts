import type { Procedure } from "@/bindings";
import * as gateway from "./gateway";

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function updateProcedure(procedure: Procedure): Promise<ServiceResult<Procedure>> {
  try {
    const result = await gateway.updateProcedure(procedure);
    return { success: true, data: result };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMsg };
  }
}

export async function deleteProcedure(id: string): Promise<ServiceResult<void>> {
  try {
    await gateway.deleteProcedure(id);
    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMsg };
  }
}
