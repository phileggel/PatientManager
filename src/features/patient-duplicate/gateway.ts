import { commands, type DuplicatePair, type PatientDuplicatesError } from "@/bindings";
import { logger } from "@/infra/logger";
import type { ServiceResult } from "@/types/api";

type DuplicateResult<T> = ServiceResult<T, PatientDuplicatesError>;

/** PDU-010 — the candidate pairs, in the order the list shows them. */
export async function listPatientDuplicates(): Promise<DuplicateResult<DuplicatePair[]>> {
  logger.debug("[patient-duplicate] listPatientDuplicates");
  const result = await commands.listPatientDuplicates();
  if (result.status === "ok") return { success: true, data: result.data };
  logger.error("[patient-duplicate] list failed", { code: result.error.code });
  return { success: false, error: result.error };
}

/** PDU-021 — merge the other patient into the kept one. */
export async function mergePatients(
  keptPatientId: string,
  otherPatientId: string,
): Promise<DuplicateResult<void>> {
  logger.info("[patient-duplicate] merge", { keptPatientId, otherPatientId });
  const result = await commands.mergePatients(keptPatientId, otherPatientId);
  if (result.status === "ok") return { success: true, data: undefined };
  logger.error("[patient-duplicate] merge failed", { code: result.error.code });
  return { success: false, error: result.error };
}

/** PDU-030 — record that the two patients are different people. */
export async function dismissPatientDuplicate(
  firstPatientId: string,
  secondPatientId: string,
): Promise<DuplicateResult<void>> {
  logger.info("[patient-duplicate] dismiss", { firstPatientId, secondPatientId });
  const result = await commands.dismissPatientDuplicate(firstPatientId, secondPatientId);
  if (result.status === "ok") return { success: true, data: undefined };
  logger.error("[patient-duplicate] dismiss failed", { code: result.error.code });
  return { success: false, error: result.error };
}
