import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands, type Patient } from "@/bindings";
import { addPatient, deletePatient, updatePatient } from "./gateway";

/**
 * Gateway pass-through contract: per F27 the gateway is a typed-error
 * forwarder — it MUST NOT transform, translate, or drop fields. These
 * tests pin that contract: the typed error from the Tauri command surfaces
 * verbatim inside `ServiceResult.error`, and the success branch returns
 * `result.data` unchanged.
 */
vi.mock("@/bindings", async () => {
  const actual = await vi.importActual<typeof import("@/bindings")>("@/bindings");
  return {
    ...actual,
    commands: {
      addPatient: vi.fn(),
      updatePatient: vi.fn(),
      deletePatient: vi.fn(),
    },
  };
});

const SAMPLE_PATIENT: Patient = {
  id: "patient-1",
  name: "Alice",
  ssn: "1234567890123",
  is_anonymous: false,
  temp_id: null,
  latest_procedure_type: null,
  latest_fund: null,
  latest_date: "",
  latest_procedure_amount: null,
};

describe("addPatient", () => {
  beforeEach(() => vi.clearAllMocks());

  it("forwards the typed error verbatim when the command returns error", async () => {
    vi.mocked(commands.addPatient).mockResolvedValue({
      status: "error",
      error: { code: "InvalidSsn" },
    });
    const result = await addPatient("Alice", "bogus");
    expect(result).toEqual({ success: false, error: { code: "InvalidSsn" } });
  });

  it("returns success and forwards the patient unchanged on ok", async () => {
    vi.mocked(commands.addPatient).mockResolvedValue({ status: "ok", data: SAMPLE_PATIENT });
    const result = await addPatient("Alice", "1234567890123");
    expect(commands.addPatient).toHaveBeenCalledWith("Alice", "1234567890123");
    expect(result).toEqual({ success: true, data: SAMPLE_PATIENT });
  });

  it("coerces empty/undefined args to null at the command boundary", async () => {
    vi.mocked(commands.addPatient).mockResolvedValue({ status: "ok", data: SAMPLE_PATIENT });
    await addPatient("Alice", undefined);
    expect(commands.addPatient).toHaveBeenCalledWith("Alice", null);
    await addPatient("", "");
    expect(commands.addPatient).toHaveBeenLastCalledWith(null, null);
  });
});

describe("updatePatient", () => {
  beforeEach(() => vi.clearAllMocks());

  it("forwards the typed error verbatim", async () => {
    vi.mocked(commands.updatePatient).mockResolvedValue({
      status: "error",
      error: { code: "DatabaseError" },
    });
    const result = await updatePatient(SAMPLE_PATIENT);
    expect(result).toEqual({ success: false, error: { code: "DatabaseError" } });
  });

  it("returns success on ok", async () => {
    vi.mocked(commands.updatePatient).mockResolvedValue({ status: "ok", data: SAMPLE_PATIENT });
    const result = await updatePatient(SAMPLE_PATIENT);
    expect(result).toEqual({ success: true, data: SAMPLE_PATIENT });
  });
});

describe("deletePatient", () => {
  beforeEach(() => vi.clearAllMocks());

  it("forwards the typed error verbatim", async () => {
    vi.mocked(commands.deletePatient).mockResolvedValue({
      status: "error",
      error: { code: "DatabaseError" },
    });
    const result = await deletePatient("patient-1");
    expect(result).toEqual({ success: false, error: { code: "DatabaseError" } });
  });

  it("returns success with undefined data on ok", async () => {
    vi.mocked(commands.deletePatient).mockResolvedValue({ status: "ok", data: null });
    const result = await deletePatient("patient-1");
    expect(result).toEqual({ success: true, data: undefined });
  });
});
