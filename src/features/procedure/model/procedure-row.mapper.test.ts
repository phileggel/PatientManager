/// <reference types="vitest/globals" />

import type { AffiliatedFund, Procedure, ProcedureType } from "@/bindings";
import { makePatient } from "@/tests/patient.factory";
import { toProcedureRow } from "./procedure-row.mapper";
import type { ProcedureRowReferenceData } from "./procedure-row.types";

// ============================================================================
// Test Helpers & Mocks
// ============================================================================

const createMockFund = (overrides?: Partial<AffiliatedFund>): AffiliatedFund => ({
  id: "fund-1",
  fund_identifier: "440",
  name: "CPAM Loire-Atlantique",
  temp_id: null,
  ...overrides,
});

const createMockProcedureType = (overrides?: Partial<ProcedureType>): ProcedureType => ({
  id: "procedure-type-1",
  name: "Consultation",
  default_amount: 25.0,
  category: "test",
  ...overrides,
});

const createMockProcedure = (overrides?: Partial<Procedure>): Procedure => ({
  id: "procedure-1",
  patient_id: "patient-1",
  fund_id: "fund-1",
  procedure_type_id: "procedure-type-1",
  procedure_date: "2026-01-15",
  procedure_amount: 50000, // 50.00€ in thousandths
  payment_method: "NONE",
  confirmed_payment_date: "",
  actual_payment_amount: null,
  payment_status: "CREATED",
  ...overrides,
});

const createMockReferenceData = (
  overrides?: Partial<ProcedureRowReferenceData>,
): ProcedureRowReferenceData => ({
  patients: [makePatient()],
  funds: [createMockFund()],
  procedureTypes: [createMockProcedureType()],
  ...overrides,
});

// ============================================================================
// toProcedureRow Tests - Complete Conversions
// ============================================================================

describe("toProcedureRow - Complete Conversions", () => {
  test("converts complete Procedure with all references found", () => {
    const procedure = createMockProcedure();
    const referenceData = createMockReferenceData();

    const result = toProcedureRow(procedure, referenceData);

    // UI metadata
    expect(result.rowId).toBeDefined();
    expect(result.isDraft).toBe(false);
    expect(result.id).toBe("procedure-1");

    // Patient data
    expect(result.patientId).toBe("patient-1");
    expect(result.patientName).toBe("Marie Dupont");
    expect(result.ssn).toBe("1234567890123");

    // Fund data
    expect(result.fundId).toBe("fund-1");
    expect(result.fundIdentifier).toBe("440");
    expect(result.fundName).toBe("CPAM Loire-Atlantique");

    // Procedure type data
    expect(result.procedureTypeId).toBe("procedure-type-1");
    expect(result.procedureName).toBe("Consultation");

    // Procedure data — amounts are in euros (converted from thousandths in the mapper)
    expect(result.procedureDate).toBe("2026-01-15");
    expect(result.procedureAmount).toBe(50.0); // 50000 thousandths → 50.00€
  });

  test("generates unique rowId for each conversion", () => {
    const procedure = createMockProcedure();
    const referenceData = createMockReferenceData();

    const result1 = toProcedureRow(procedure, referenceData);
    const result2 = toProcedureRow(procedure, referenceData);

    expect(result1.rowId).not.toBe(result2.rowId);
  });
});

// ============================================================================
// toProcedureRow Tests - Missing References
// ============================================================================

describe("toProcedureRow - Missing References", () => {
  test("handles missing patient reference (ID exists but not in referenceData)", () => {
    const procedure = createMockProcedure({ patient_id: "patient-999" });
    const referenceData = createMockReferenceData();

    const result = toProcedureRow(procedure, referenceData);

    expect(result.patientId).toBe("patient-999");
    expect(result.patientName).toBeNull();
    expect(result.ssn).toBeNull();
  });

  test("handles missing fund reference (ID exists but not in referenceData)", () => {
    const procedure = createMockProcedure({ fund_id: "fund-999" });
    const referenceData = createMockReferenceData();

    const result = toProcedureRow(procedure, referenceData);

    expect(result.fundId).toBe("fund-999");
    expect(result.fundIdentifier).toBeNull();
    expect(result.fundName).toBeNull();
  });

  test("handles missing procedure type reference (ID exists but not in referenceData)", () => {
    const procedure = createMockProcedure({ procedure_type_id: "type-999" });
    const referenceData = createMockReferenceData();

    const result = toProcedureRow(procedure, referenceData);

    expect(result.procedureTypeId).toBe("type-999");
    expect(result.procedureName).toBeNull();
  });

  test("handles empty reference data arrays", () => {
    const procedure = createMockProcedure();
    const referenceData: ProcedureRowReferenceData = {
      patients: [],
      funds: [],
      procedureTypes: [],
    };

    const result = toProcedureRow(procedure, referenceData);

    expect(result.patientId).toBe("patient-1");
    expect(result.patientName).toBeNull();

    expect(result.fundId).toBe("fund-1");
    expect(result.fundIdentifier).toBeNull();

    expect(result.procedureTypeId).toBe("procedure-type-1");
    expect(result.procedureName).toBeNull();
  });
});

// ============================================================================
// toProcedureRow Tests - Null Foreign Keys
// ============================================================================

describe("toProcedureRow - Null Foreign Keys", () => {
  test("handles missing patient when patient_id doesn't exist in references", () => {
    const procedure = createMockProcedure({ patient_id: "non-existent-patient" });
    const referenceData = createMockReferenceData();

    const result = toProcedureRow(procedure, referenceData);

    expect(result.patientId).toBe("non-existent-patient");
    expect(result.patientName).toBeNull();
    expect(result.ssn).toBeNull();
  });

  test("handles null fund_id", () => {
    const procedure = createMockProcedure({ fund_id: null });
    const referenceData = createMockReferenceData();

    const result = toProcedureRow(procedure, referenceData);

    expect(result.fundId).toBeNull();
    expect(result.fundIdentifier).toBeNull();
    expect(result.fundName).toBeNull();
  });

  test("handles missing procedure type when procedure_type_id doesn't exist in references", () => {
    const procedure = createMockProcedure({ procedure_type_id: "non-existent-type" });
    const referenceData = createMockReferenceData();

    const result = toProcedureRow(procedure, referenceData);

    expect(result.procedureTypeId).toBe("non-existent-type");
    expect(result.procedureName).toBeNull();
  });

  test("handles procedure with only nullable fund_id as null", () => {
    const procedure = createMockProcedure({
      fund_id: null,
    });
    const referenceData = createMockReferenceData();

    const result = toProcedureRow(procedure, referenceData);

    // Should still create a valid ProcedureRow
    expect(result.rowId).toBeDefined();
    expect(result.isDraft).toBe(false);
    expect(result.procedureDate).toBe("2026-01-15");
    expect(result.procedureAmount).toBe(50.0); // 50000 thousandths → 50.00€

    // Fund fields should be null
    expect(result.fundId).toBeNull();
    expect(result.fundIdentifier).toBeNull();
    expect(result.fundName).toBeNull();

    // Other fields should still be populated
    expect(result.patientId).toBe("patient-1");
    expect(result.procedureTypeId).toBe("procedure-type-1");
  });
});

// ============================================================================
// toProcedureRow Tests - Multiple References
// ============================================================================

describe("toProcedureRow - Multiple References", () => {
  test("finds correct reference when multiple exist", () => {
    const patient1 = makePatient({ id: "patient-1" });
    const patient2 = makePatient({ id: "patient-2" });
    const patient3 = makePatient({ id: "patient-3" });

    const procedure = createMockProcedure({ patient_id: "patient-2" });
    const referenceData = createMockReferenceData({
      patients: [patient1, patient2, patient3],
    });

    const result = toProcedureRow(procedure, referenceData);

    expect(result.patientName).toBe("Marie Dupont");
  });

  test("finds correct fund among multiple", () => {
    const fund1 = createMockFund({ id: "fund-1", fund_identifier: "001", name: "Fund A" });
    const fund2 = createMockFund({ id: "fund-2", fund_identifier: "002", name: "Fund B" });
    const fund3 = createMockFund({ id: "fund-3", fund_identifier: "003", name: "Fund C" });

    const procedure = createMockProcedure({ fund_id: "fund-3" });
    const referenceData = createMockReferenceData({
      funds: [fund1, fund2, fund3],
    });

    const result = toProcedureRow(procedure, referenceData);

    expect(result.fundIdentifier).toBe("003");
    expect(result.fundName).toBe("Fund C");
  });

  test("finds correct procedure type among multiple", () => {
    const type1 = createMockProcedureType({ id: "type-1", name: "Type A" });
    const type2 = createMockProcedureType({ id: "type-2", name: "Type B" });
    const type3 = createMockProcedureType({ id: "type-3", name: "Type C" });

    const procedure = createMockProcedure({ procedure_type_id: "type-1" });
    const referenceData = createMockReferenceData({
      procedureTypes: [type1, type2, type3],
    });

    const result = toProcedureRow(procedure, referenceData);

    expect(result.procedureName).toBe("Type A");
  });
});

// ============================================================================
// toProcedureRow Tests - Edge Cases
// ============================================================================

describe("toProcedureRow - Edge Cases", () => {
  test("handles procedure with zero amount", () => {
    const procedure = createMockProcedure({ procedure_amount: 0 });
    const referenceData = createMockReferenceData();

    const result = toProcedureRow(procedure, referenceData);

    expect(result.procedureAmount).toBe(0);
  });

  test("handles procedure with negative amount (edge case)", () => {
    const procedure = createMockProcedure({ procedure_amount: -50000 }); // -50.00€ in thousandths
    const referenceData = createMockReferenceData();

    const result = toProcedureRow(procedure, referenceData);

    expect(result.procedureAmount).toBe(-50.0);
  });

  test("handles procedure with very large amount", () => {
    const procedure = createMockProcedure({ procedure_amount: 1000000000 }); // 1,000,000€ in thousandths
    const referenceData = createMockReferenceData();

    const result = toProcedureRow(procedure, referenceData);

    expect(result.procedureAmount).toBe(1000000);
  });

  test("preserves date string exactly as provided", () => {
    const procedure = createMockProcedure({ procedure_date: "2026-12-31" });
    const referenceData = createMockReferenceData();

    const result = toProcedureRow(procedure, referenceData);

    expect(result.procedureDate).toBe("2026-12-31");
  });
});
