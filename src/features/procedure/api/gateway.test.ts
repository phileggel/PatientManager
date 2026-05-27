import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Fund, Patient, Procedure, ProcedureType, RawProcedure } from "@/bindings";

// ---------------------------------------------------------------------------
// Mocks — declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock("@/bindings", () => ({
  commands: {
    readAllProcedures: vi.fn(),
    addProcedure: vi.fn(),
    updateProcedure: vi.fn(),
    deleteProcedure: vi.fn(),
    readAllPatients: vi.fn(),
    readAllFunds: vi.fn(),
    readAllProcedureTypes: vi.fn(),
    addPatient: vi.fn(),
    addFund: vi.fn(),
    addProcedureType: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { commands } from "@/bindings";
import {
  addProcedure,
  createNewFund,
  createNewPatient,
  createNewProcedureType,
  deleteProcedure,
  fetchAllFunds,
  fetchAllPatients,
  fetchAllProcedureTypes,
  readAllProcedures,
  updateProcedure,
} from "./gateway";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_PROCEDURE: Procedure = {
  id: "proc-1",
  patient_id: "p-1",
  fund_id: null,
  procedure_type_id: "pt-1",
  procedure_date: "2026-05-01",
  billed_amount: 50000,
  payment_method: "NONE",
  fund_reconciliation_date: "",
  confirmed_payment_date: "",
  paid_amount: null,
  payment_status: "CREATED",
};

const SAMPLE_PATIENT: Patient = {
  id: "p-1",
  is_anonymous: false,
  name: "Alice",
  ssn: "1234567890123",
  latest_procedure_type: null,
  latest_fund: null,
  latest_date: "",
  latest_procedure_amount: null,
};

const SAMPLE_FUND: Fund = {
  id: "f-1",
  fund_identifier: "CPAM",
  name: "CPAM France",
  temp_id: null,
};

const SAMPLE_PROCEDURE_TYPE: ProcedureType = {
  id: "pt-1",
  name: "Consultation",
  default_amount: 25000,
  category: null,
};

const SAMPLE_RAW_PROCEDURE: RawProcedure = {
  id: "proc-1",
  patient_id: "p-1",
  fund_id: null,
  procedure_type_id: "pt-1",
  procedure_date: "2026-05-01",
  billed_amount: 50000,
  payment_method: "NONE",
  fund_reconciliation_date: null,
  confirmed_payment_date: null,
  paid_amount: null,
  payment_status: "CREATED",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// readAllProcedures
// ---------------------------------------------------------------------------

describe("readAllProcedures", () => {
  it("returns success result with data on ok", async () => {
    vi.mocked(commands.readAllProcedures).mockResolvedValue({
      status: "ok",
      data: [SAMPLE_PROCEDURE],
    });
    const result = await readAllProcedures();
    expect(result).toEqual({ success: true, data: [SAMPLE_PROCEDURE] });
  });

  it("returns failure result with error on error", async () => {
    vi.mocked(commands.readAllProcedures).mockResolvedValue({
      status: "error",
      error: "db unavailable",
    });
    const result = await readAllProcedures();
    expect(result).toEqual({ success: false, error: "db unavailable" });
  });
});

// ---------------------------------------------------------------------------
// addProcedure
// ---------------------------------------------------------------------------

describe("addProcedure", () => {
  it("forwards args positionally and returns success", async () => {
    vi.mocked(commands.addProcedure).mockResolvedValue({
      status: "ok",
      data: SAMPLE_PROCEDURE,
    });
    const result = await addProcedure("p-1", "f-1", "pt-1", "2026-05-01", 50000);
    expect(commands.addProcedure).toHaveBeenCalledWith("p-1", "f-1", "pt-1", "2026-05-01", 50000);
    expect(result).toEqual({ success: true, data: SAMPLE_PROCEDURE });
  });

  it("returns failure result on command error", async () => {
    vi.mocked(commands.addProcedure).mockResolvedValue({
      status: "error",
      error: "validation failed",
    });
    const result = await addProcedure("p-1", null, "pt-1", "2026-05-01", 0);
    expect(result).toEqual({ success: false, error: "validation failed" });
  });
});

// ---------------------------------------------------------------------------
// updateProcedure
// ---------------------------------------------------------------------------

describe("updateProcedure", () => {
  it("returns success result with updated procedure", async () => {
    vi.mocked(commands.updateProcedure).mockResolvedValue({
      status: "ok",
      data: SAMPLE_PROCEDURE,
    });
    const result = await updateProcedure(SAMPLE_RAW_PROCEDURE);
    expect(commands.updateProcedure).toHaveBeenCalledWith(SAMPLE_RAW_PROCEDURE);
    expect(result).toEqual({ success: true, data: SAMPLE_PROCEDURE });
  });

  it("returns failure result on command error", async () => {
    vi.mocked(commands.updateProcedure).mockResolvedValue({
      status: "error",
      error: "not found",
    });
    const result = await updateProcedure(SAMPLE_RAW_PROCEDURE);
    expect(result).toEqual({ success: false, error: "not found" });
  });
});

// ---------------------------------------------------------------------------
// deleteProcedure (void result branch)
// ---------------------------------------------------------------------------

describe("deleteProcedure", () => {
  it("returns success with undefined data on ok", async () => {
    vi.mocked(commands.deleteProcedure).mockResolvedValue({
      status: "ok",
      data: null,
    });
    const result = await deleteProcedure("proc-1");
    expect(commands.deleteProcedure).toHaveBeenCalledWith("proc-1");
    expect(result).toEqual({ success: true, data: undefined });
  });

  it("returns failure result on command error", async () => {
    vi.mocked(commands.deleteProcedure).mockResolvedValue({
      status: "error",
      error: "blocked by status",
    });
    const result = await deleteProcedure("proc-1");
    expect(result).toEqual({ success: false, error: "blocked by status" });
  });
});

// ---------------------------------------------------------------------------
// fetchAllPatients / fetchAllFunds / fetchAllProcedureTypes
// ---------------------------------------------------------------------------

describe("fetchAllPatients", () => {
  it("returns success result with patients list", async () => {
    vi.mocked(commands.readAllPatients).mockResolvedValue({
      status: "ok",
      data: [SAMPLE_PATIENT],
    });
    const result = await fetchAllPatients();
    expect(result).toEqual({ success: true, data: [SAMPLE_PATIENT] });
  });

  it("returns failure result on command error", async () => {
    vi.mocked(commands.readAllPatients).mockResolvedValue({
      status: "error",
      error: { code: "DatabaseError" },
    });
    const result = await fetchAllPatients();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/database error/i);
    }
  });
});

describe("fetchAllFunds", () => {
  it("returns success result with funds list", async () => {
    vi.mocked(commands.readAllFunds).mockResolvedValue({
      status: "ok",
      data: [SAMPLE_FUND],
    });
    const result = await fetchAllFunds();
    expect(result).toEqual({ success: true, data: [SAMPLE_FUND] });
  });

  it("returns failure result on command error", async () => {
    vi.mocked(commands.readAllFunds).mockResolvedValue({
      status: "error",
      error: "boom",
    });
    const result = await fetchAllFunds();
    expect(result).toEqual({ success: false, error: "boom" });
  });
});

describe("fetchAllProcedureTypes", () => {
  it("returns success result with procedure-type list", async () => {
    vi.mocked(commands.readAllProcedureTypes).mockResolvedValue({
      status: "ok",
      data: [SAMPLE_PROCEDURE_TYPE],
    });
    const result = await fetchAllProcedureTypes();
    expect(result).toEqual({ success: true, data: [SAMPLE_PROCEDURE_TYPE] });
  });

  it("returns failure result on command error", async () => {
    vi.mocked(commands.readAllProcedureTypes).mockResolvedValue({
      status: "error",
      error: { code: "DatabaseError" },
    });
    const result = await fetchAllProcedureTypes();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/database error/i);
    }
  });
});

// ---------------------------------------------------------------------------
// createNewPatient / createNewFund / createNewProcedureType
// ---------------------------------------------------------------------------

describe("createNewPatient", () => {
  it("forwards name + ssn and returns success", async () => {
    vi.mocked(commands.addPatient).mockResolvedValue({
      status: "ok",
      data: SAMPLE_PATIENT,
    });
    const result = await createNewPatient("Alice", "1234567890123");
    expect(commands.addPatient).toHaveBeenCalledWith("Alice", "1234567890123");
    expect(result).toEqual({ success: true, data: SAMPLE_PATIENT });
  });

  it("returns failure result on command error", async () => {
    vi.mocked(commands.addPatient).mockResolvedValue({
      status: "error",
      error: { code: "InvalidSsn" },
    });
    const result = await createNewPatient(null, null);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/13 numeric digits/i);
    }
  });
});

describe("createNewFund", () => {
  it("forwards identifier + name and returns success", async () => {
    vi.mocked(commands.addFund).mockResolvedValue({
      status: "ok",
      data: SAMPLE_FUND,
    });
    const result = await createNewFund("CPAM", "CPAM France");
    expect(commands.addFund).toHaveBeenCalledWith("CPAM", "CPAM France");
    expect(result).toEqual({ success: true, data: SAMPLE_FUND });
  });

  it("returns failure result on command error", async () => {
    vi.mocked(commands.addFund).mockResolvedValue({
      status: "error",
      error: "duplicate identifier",
    });
    const result = await createNewFund("CPAM", "CPAM France");
    expect(result).toEqual({ success: false, error: "duplicate identifier" });
  });
});

describe("createNewProcedureType", () => {
  it("forwards args (defaultAmount null → 0) and returns success", async () => {
    vi.mocked(commands.addProcedureType).mockResolvedValue({
      status: "ok",
      data: SAMPLE_PROCEDURE_TYPE,
    });
    const result = await createNewProcedureType("Consultation", null, null);
    expect(commands.addProcedureType).toHaveBeenCalledWith("Consultation", 0, null);
    expect(result).toEqual({ success: true, data: SAMPLE_PROCEDURE_TYPE });
  });

  it("passes defaultAmount value verbatim when non-null", async () => {
    vi.mocked(commands.addProcedureType).mockResolvedValue({
      status: "ok",
      data: SAMPLE_PROCEDURE_TYPE,
    });
    await createNewProcedureType("Radio", 50000, "Imaging");
    expect(commands.addProcedureType).toHaveBeenCalledWith("Radio", 50000, "Imaging");
  });

  it("returns failure result on command error", async () => {
    vi.mocked(commands.addProcedureType).mockResolvedValue({
      status: "error",
      error: { code: "ProcedureTypeNameDuplicate" },
    });
    const result = await createNewProcedureType("Consultation", null, null);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/already exists/i);
    }
  });
});
