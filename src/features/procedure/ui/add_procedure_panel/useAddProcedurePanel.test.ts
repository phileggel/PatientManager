import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AffiliatedFund, ProcedureType } from "@/bindings";
import { useAppStore } from "@/lib/appStore";
import { makePatient } from "@/tests/patient.factory";
import { useAddProcedurePanel } from "./useAddProcedurePanel";

vi.mock("@/features/procedure/api/gateway", () => ({
  addProcedure: vi.fn(),
  createNewPatient: vi.fn(),
  createNewFund: vi.fn(),
  readAllProcedures: vi.fn(),
}));

vi.mock("@/core/snackbar", () => ({
  toastService: { show: vi.fn(), subscribe: vi.fn(() => vi.fn()) },
}));

// --- Test data ---

const mockProcedureTypes: ProcedureType[] = [
  { id: "pt1", name: "Consultation", default_amount: 25000, category: null },
  { id: "pt2", name: "Radio", default_amount: 50000, category: null },
];

const mockFunds: AffiliatedFund[] = [
  { id: "f1", fund_identifier: "CPAM", name: "CPAM France", temp_id: null },
];

const mockPatientFull = makePatient({
  id: "p1",
  latest_procedure_type: "pt2",
  latest_fund: "f1",
  latest_date: "2026-01-15",
  latest_procedure_amount: 42500,
});

const mockPatientEmpty = makePatient({
  id: "p2",
});

// --- Setup ---

beforeEach(() => {
  useAppStore.setState({
    patients: [mockPatientFull, mockPatientEmpty],
    funds: mockFunds,
    procedureTypes: mockProcedureTypes,
  });
  vi.clearAllMocks();
});

// --- Tests ---

describe("auto-fill on patient select", () => {
  it("fills fund, procedure type, date and amount from patient latest data", () => {
    const today = new Date().toISOString().split("T")[0];
    const { result } = renderHook(() => useAddProcedurePanel());

    act(() => {
      result.current.handlePatientChange("p1");
    });

    expect(result.current.fundId).toBe("f1");
    expect(result.current.procedureTypeId).toBe("pt2");
    expect(result.current.procedureDate).toBe(today);
    expect(result.current.procedureAmount).toBe(42.5);
  });

  it("does not overwrite fund if already set", () => {
    const { result } = renderHook(() => useAddProcedurePanel());

    act(() => {
      result.current.setFundId("f-other");
    });
    act(() => {
      result.current.handlePatientChange("p1");
    });

    expect(result.current.fundId).toBe("f-other");
  });

  it("does not overwrite date if already set", () => {
    const { result } = renderHook(() => useAddProcedurePanel());

    act(() => {
      result.current.setProcedureDate("2025-12-01");
    });
    act(() => {
      result.current.handlePatientChange("p1");
    });

    expect(result.current.procedureDate).toBe("2025-12-01");
  });

  it("does not overwrite amount if already set", () => {
    const { result } = renderHook(() => useAddProcedurePanel());

    act(() => {
      result.current.setProcedureAmount(99.0);
    });
    act(() => {
      result.current.handlePatientChange("p1");
    });

    expect(result.current.procedureAmount).toBe(99.0);
  });

  it("leaves fields empty when patient has no latest data", () => {
    const { result } = renderHook(() => useAddProcedurePanel());

    act(() => {
      result.current.handlePatientChange("p2");
    });

    expect(result.current.fundId).toBe("");
    expect(result.current.procedureTypeId).toBe("");
    expect(result.current.procedureAmount).toBeNull();
  });
});

describe("gateway arguments on submit", () => {
  it("calls addProcedure with correct positional arguments", async () => {
    const { addProcedure } = await import("@/features/procedure/api/gateway");
    const mockAdd = vi.mocked(addProcedure);
    mockAdd.mockResolvedValueOnce({
      id: "proc1",
      patient_id: "p1",
      fund_id: "f1",
      procedure_type_id: "pt2",
      procedure_date: "2026-03-01",
      procedure_amount: 42500,
      payment_method: "NONE",
      confirmed_payment_date: "",
      payment_status: "CREATED",
      actual_payment_amount: null,
    });

    const { result } = renderHook(() => useAddProcedurePanel());

    act(() => {
      result.current.handlePatientChange("p1");
      result.current.setProcedureDate("2026-03-01");
    });

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    expect(mockAdd).toHaveBeenCalledWith("p1", "f1", "pt2", "2026-03-01", 42500);
  });

  it("passes null for fund when not selected", async () => {
    const { addProcedure } = await import("@/features/procedure/api/gateway");
    const mockAdd = vi.mocked(addProcedure);
    mockAdd.mockResolvedValueOnce({
      id: "proc2",
      patient_id: "p2",
      fund_id: null,
      procedure_type_id: "pt1",
      procedure_date: "2026-03-01",
      procedure_amount: null,
      payment_method: "NONE",
      confirmed_payment_date: "",
      payment_status: "CREATED",
      actual_payment_amount: null,
    });

    const { result } = renderHook(() => useAddProcedurePanel());

    act(() => {
      result.current.handlePatientChange("p2"); // no latest data → no auto-fill
      result.current.setProcedureTypeId("pt1");
      result.current.setProcedureDate("2026-03-01");
    });

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    expect(mockAdd).toHaveBeenCalledWith("p2", null, "pt1", "2026-03-01", null);
  });
});

describe("reset after successful submit", () => {
  it("resets all fields to initial values", async () => {
    const { addProcedure } = await import("@/features/procedure/api/gateway");
    vi.mocked(addProcedure).mockResolvedValueOnce({
      id: "proc1",
      patient_id: "p1",
      fund_id: "f1",
      procedure_type_id: "pt2",
      procedure_date: "2026-03-01",
      procedure_amount: 42500,
      payment_method: "NONE",
      confirmed_payment_date: "",
      payment_status: "CREATED",
      actual_payment_amount: null,
    });

    const { result } = renderHook(() => useAddProcedurePanel());

    act(() => {
      result.current.handlePatientChange("p1");
      result.current.setProcedureDate("2026-03-01");
    });

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    expect(result.current.patientId).toBe("");
    expect(result.current.fundId).toBe("");
    expect(result.current.procedureTypeId).toBe("");
    expect(result.current.procedureDate).toBe("");
    expect(result.current.procedureAmount).toBeNull();
    expect(result.current.paymentMethod).toBe("NONE");
  });
});

describe("error handling", () => {
  it("shows error toast on gateway failure", async () => {
    const { toastService } = await import("@/core/snackbar");
    const { addProcedure } = await import("@/features/procedure/api/gateway");
    vi.mocked(addProcedure).mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useAddProcedurePanel());

    act(() => {
      result.current.handlePatientChange("p1");
      result.current.setProcedureDate("2026-03-01");
    });

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    expect(toastService.show).toHaveBeenCalledWith("error", "Network error");
  });
});
