import { commands, type Patient } from "@/bindings";
import { useAppStore } from "@/lib/appStore";
import { logger } from "@/lib/logger";
import type { ServiceResult } from "@/types/api";

export function readAllPatients(): ServiceResult<Patient[]> {
  logger.debug("Fetching all patients from store");
  const patients = useAppStore.getState().patients;
  return { success: true, data: patients };
}

export async function addPatient(name: string, ssn?: string): Promise<ServiceResult<Patient>> {
  logger.info("Adding patient", { name, hasSsn: !!ssn });

  const result = await commands.addPatient(name || null, ssn || null);

  if (result.status === "ok") {
    logger.info("Patient added successfully", { patientId: result.data.id, name });
    return { success: true, data: result.data };
  } else {
    logger.error("Failed to add patient", { error: result.error });
    return { success: false, error: result.error };
  }
}

export async function updatePatient(patient: Patient): Promise<ServiceResult<Patient>> {
  logger.info("Updating patient", { patientId: patient.id, name: patient.name });

  const result = await commands.updatePatient(patient);

  if (result.status === "ok") {
    logger.info("Patient updated successfully");
    return { success: true, data: result.data };
  } else {
    logger.error("Failed to update patient", { error: result.error });
    return { success: false, error: result.error };
  }
}

export async function deletePatient(id: string): Promise<ServiceResult<void>> {
  logger.info("Deleting patient", { patientId: id });

  const result = await commands.deletePatient(id);

  if (result.status === "ok") {
    logger.info("Patient deleted successfully", { patientId: id });
    return { success: true, data: undefined };
  } else {
    logger.error("Failed to delete patient", { error: result.error });
    return { success: false, error: result.error };
  }
}
