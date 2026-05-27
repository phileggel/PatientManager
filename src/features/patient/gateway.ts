import { commands, type Patient, type PatientError } from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";
import { logger } from "@/infra/logger";
import type { ServiceResult } from "@/types/api";

export function readAllPatients(): ServiceResult<Patient[]> {
  logger.debug("Fetching all patients from store");
  const patients = useCacheStore.getState().patients;
  return { success: true, data: patients };
}

export async function addPatient(
  name: string,
  ssn?: string,
): Promise<ServiceResult<Patient, PatientError>> {
  logger.info("Adding patient", { hasName: !!name, hasSsn: !!ssn });
  const result = await commands.addPatient(name || null, ssn || null);
  if (result.status === "ok") {
    logger.info("Patient added successfully", { patientId: result.data.id });
    return { success: true, data: result.data };
  }
  logger.error("Failed to add patient", { code: result.error.code });
  return { success: false, error: result.error };
}

export async function updatePatient(
  patient: Patient,
): Promise<ServiceResult<Patient, PatientError>> {
  logger.info("Updating patient", { patientId: patient.id });
  const result = await commands.updatePatient(patient);
  if (result.status === "ok") {
    logger.info("Patient updated successfully");
    return { success: true, data: result.data };
  }
  logger.error("Failed to update patient", { code: result.error.code });
  return { success: false, error: result.error };
}

export async function deletePatient(id: string): Promise<ServiceResult<void, PatientError>> {
  logger.info("Deleting patient", { patientId: id });
  const result = await commands.deletePatient(id);
  if (result.status === "ok") {
    logger.info("Patient deleted successfully", { patientId: id });
    return { success: true, data: undefined };
  }
  logger.error("Failed to delete patient", { code: result.error.code });
  return { success: false, error: result.error };
}
