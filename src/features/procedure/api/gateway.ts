/**
 * Procedure Feature Gateway
 *
 * Single gateway for all procedure feature operations, maintaining feature isolation.
 *
 * All domain types come from @/bindings.ts (Specta-generated from Rust).
 * All operations call Tauri commands directly via the commands object.
 *
 * Per F27: gateway is a pass-through that converts the Specta `Result<T, string>`
 * wire shape into the project-wide `ServiceResult<T>` envelope. No throwing —
 * callers branch on `result.success` and present typed errors via i18n.
 */

import {
  commands,
  type Fund,
  type FundError,
  type Patient,
  type PatientError,
  type Procedure,
  type ProcedureError,
  type ProcedureOrchestrationError,
  type ProcedureType,
  type RawProcedure,
} from "@/bindings";
import type { ServiceResult } from "@/types/api";

// ============================================
// Procedure CRUD Operations
// ============================================
//
// Per F27: pure pass-through of the typed `ProcedureOrchestrationError` wire
// shape into the `ServiceResult` envelope. No throwing — callers branch on
// `result.success` and translate via `formatProcedureOrchestrationError`.

/**
 * Fetch all procedures
 */
export async function readAllProcedures(): Promise<
  ServiceResult<Procedure[], ProcedureOrchestrationError>
> {
  const result = await commands.readAllProcedures();
  if (result.status === "ok") return { success: true, data: result.data };
  return { success: false, error: result.error };
}

/**
 * Add a new procedure
 */
export async function addProcedure(
  patientId: string,
  fundId: string | null,
  procedureTypeId: string,
  procedureDate: string,
  billedAmount: number,
): Promise<ServiceResult<Procedure, ProcedureOrchestrationError>> {
  const result = await commands.addProcedure(
    patientId,
    fundId,
    procedureTypeId,
    procedureDate,
    billedAmount,
  );
  if (result.status === "ok") return { success: true, data: result.data };
  return { success: false, error: result.error };
}

/**
 * Update an existing procedure
 */
export async function updateProcedure(
  procedure: RawProcedure,
): Promise<ServiceResult<Procedure, ProcedureOrchestrationError>> {
  const result = await commands.updateProcedure(procedure);
  if (result.status === "ok") return { success: true, data: result.data };
  return { success: false, error: result.error };
}

/**
 * Delete a procedure
 */
export async function deleteProcedure(
  id: string,
): Promise<ServiceResult<void, ProcedureOrchestrationError>> {
  const result = await commands.deleteProcedure(id);
  if (result.status === "ok") {
    return { success: true, data: undefined };
  }
  return { success: false, error: result.error };
}

// ============================================
// Reference Data Operations (for autocomplete)
// ============================================

/**
 * Fetch all patients for autocomplete
 */
export async function fetchAllPatients(): Promise<ServiceResult<Patient[], PatientError>> {
  const result = await commands.readAllPatients();
  if (result.status === "ok") {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Fetch all funds for autocomplete
 */
export async function fetchAllFunds(): Promise<ServiceResult<Fund[], FundError>> {
  const result = await commands.readAllFunds();
  if (result.status === "ok") {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Fetch all procedure types for autocomplete
 */
export async function fetchAllProcedureTypes(): Promise<
  ServiceResult<ProcedureType[], ProcedureError>
> {
  const result = await commands.readAllProcedureTypes();
  if (result.status === "ok") {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Create a new patient
 */
export async function createNewPatient(
  name: string | null,
  ssn: string | null,
): Promise<ServiceResult<Patient, PatientError>> {
  const result = await commands.addPatient(name, ssn);
  if (result.status === "ok") {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Create a new fund
 */
export async function createNewFund(
  fundIdentifier: string,
  name: string,
): Promise<ServiceResult<Fund, FundError>> {
  const result = await commands.addFund(fundIdentifier, name);
  if (result.status === "ok") {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Create a new procedure type
 */
export async function createNewProcedureType(
  name: string,
  defaultAmount: number | null,
  category: string | null,
): Promise<ServiceResult<ProcedureType, ProcedureError>> {
  const result = await commands.addProcedureType(name, defaultAmount ?? 0, category);
  if (result.status === "ok") {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
