/**
 * Procedure Feature Gateway
 *
 * Single gateway for all procedure feature operations, maintaining feature isolation.
 *
 * All domain types come from @/bindings.ts (Specta-generated from Rust).
 * All operations call Tauri commands directly via the commands object.
 *
 * Note: Tauri commands return Result<T, E>. This gateway unwraps them and throws
 * errors for failure cases, allowing clean async/await usage with try/catch.
 */

import {
  type AffiliatedFund,
  commands,
  type Patient,
  type Procedure,
  type ProcedureType,
  type RawProcedure,
  type Result,
} from "@/bindings";

/**
 * Unwrap a Result type, throwing an error if it's an error result
 */
function unwrapResult<T>(result: Result<T, string>): T {
  if (result.status === "ok") {
    return result.data;
  }
  throw new Error(result.error);
}

// ============================================
// Procedure CRUD Operations
// ============================================

/**
 * Fetch all procedures
 */
export async function readAllProcedures(): Promise<Procedure[]> {
  const result = await commands.readAllProcedures();
  return unwrapResult(result);
}

/**
 * Add a new procedure
 */
export async function addProcedure(
  patientId: string,
  fundId: string | null,
  procedureTypeId: string,
  procedureDate: string,
  procedureAmount: number | null,
): Promise<Procedure> {
  const result = await commands.addProcedure(
    patientId,
    fundId,
    procedureTypeId,
    procedureDate,
    procedureAmount,
  );
  return unwrapResult(result);
}

/**
 * Update an existing procedure
 */
export async function updateProcedure(procedure: RawProcedure): Promise<Procedure> {
  const result = await commands.updateProcedure(procedure);
  return unwrapResult(result);
}

/**
 * Delete a procedure
 */
export async function deleteProcedure(id: string): Promise<void> {
  const result = await commands.deleteProcedure(id);
  unwrapResult(result);
}

// ============================================
// Reference Data Operations (for autocomplete)
// ============================================

/**
 * Fetch all patients for autocomplete
 */
export async function fetchAllPatients(): Promise<Patient[]> {
  const result = await commands.readAllPatients();
  return unwrapResult(result);
}

/**
 * Fetch all funds for autocomplete
 */
export async function fetchAllFunds(): Promise<AffiliatedFund[]> {
  const result = await commands.readAllFunds();
  return unwrapResult(result);
}

/**
 * Fetch all procedure types for autocomplete
 */
export async function fetchAllProcedureTypes(): Promise<ProcedureType[]> {
  const result = await commands.readAllProcedureTypes();
  return unwrapResult(result);
}

/**
 * Create a new patient
 */
export async function createNewPatient(name: string | null, ssn: string | null): Promise<Patient> {
  const result = await commands.addPatient(name, ssn);
  return unwrapResult(result);
}

/**
 * Create a new fund
 */
export async function createNewFund(fundIdentifier: string, name: string): Promise<AffiliatedFund> {
  const result = await commands.addFund(fundIdentifier, name);
  return unwrapResult(result);
}

/**
 * Create a new procedure type
 */
export async function createNewProcedureType(
  name: string,
  defaultAmount: number | null,
  category: string | null,
): Promise<ProcedureType> {
  const result = await commands.addProcedureType(name, defaultAmount ?? 0, category);
  return unwrapResult(result);
}
