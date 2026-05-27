import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands, type ProcedureType } from "@/bindings";
import {
  addProcedureType,
  deleteProcedureType,
  reloadProcedureTypes,
  updateProcedureType,
} from "./gateway";

/**
 * Gateway pass-through contract: per F27 the gateway forwards the typed
 * error from the Tauri command verbatim inside `ServiceResult.error`. No
 * translation, no remapping. These tests pin that contract.
 */
vi.mock("@/bindings", async () => {
  const actual = await vi.importActual<typeof import("@/bindings")>("@/bindings");
  return {
    ...actual,
    commands: {
      addProcedureType: vi.fn(),
      readAllProcedureTypes: vi.fn(),
      updateProcedureType: vi.fn(),
      deleteProcedureType: vi.fn(),
    },
  };
});

const SAMPLE: ProcedureType = {
  id: "pt-1",
  name: "Consultation",
  default_amount: 100000,
  category: null,
};

describe("addProcedureType", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns success on ok and forwards args verbatim", async () => {
    vi.mocked(commands.addProcedureType).mockResolvedValue({ status: "ok", data: SAMPLE });
    const result = await addProcedureType("Consultation", 100000);
    expect(commands.addProcedureType).toHaveBeenCalledWith("Consultation", 100000, null);
    expect(result).toEqual({ success: true, data: SAMPLE });
  });

  it("forwards typed ProcedureError verbatim on failure", async () => {
    vi.mocked(commands.addProcedureType).mockResolvedValue({
      status: "error",
      error: { code: "ProcedureTypeNameDuplicate" },
    });
    const result = await addProcedureType("Consultation", 100000);
    expect(result).toEqual({
      success: false,
      error: { code: "ProcedureTypeNameDuplicate" },
    });
  });
});

describe("updateProcedureType", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns success on ok", async () => {
    vi.mocked(commands.updateProcedureType).mockResolvedValue({ status: "ok", data: SAMPLE });
    const result = await updateProcedureType(SAMPLE);
    expect(result).toEqual({ success: true, data: SAMPLE });
  });

  it("forwards typed error verbatim on failure", async () => {
    vi.mocked(commands.updateProcedureType).mockResolvedValue({
      status: "error",
      error: { code: "ReservedTypeNotMutable" },
    });
    const result = await updateProcedureType(SAMPLE);
    expect(result).toEqual({
      success: false,
      error: { code: "ReservedTypeNotMutable" },
    });
  });
});

describe("deleteProcedureType", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns success with undefined data on ok", async () => {
    vi.mocked(commands.deleteProcedureType).mockResolvedValue({ status: "ok", data: null });
    const result = await deleteProcedureType("pt-1");
    expect(result).toEqual({ success: true, data: undefined });
  });

  it("forwards typed error verbatim on failure", async () => {
    vi.mocked(commands.deleteProcedureType).mockResolvedValue({
      status: "error",
      error: { code: "DatabaseError" },
    });
    const result = await deleteProcedureType("pt-1");
    expect(result).toEqual({ success: false, error: { code: "DatabaseError" } });
  });
});

describe("reloadProcedureTypes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns success on ok", async () => {
    vi.mocked(commands.readAllProcedureTypes).mockResolvedValue({
      status: "ok",
      data: [SAMPLE],
    });
    const result = await reloadProcedureTypes();
    expect(result).toEqual({ success: true, data: [SAMPLE] });
  });

  it("returns typed error unchanged so the cache can store it", async () => {
    vi.mocked(commands.readAllProcedureTypes).mockResolvedValue({
      status: "error",
      error: { code: "DatabaseError" },
    });
    const result = await reloadProcedureTypes();
    expect(result).toEqual({ success: false, error: { code: "DatabaseError" } });
  });
});
