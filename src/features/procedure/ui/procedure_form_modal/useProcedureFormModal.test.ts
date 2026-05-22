import { act, renderHook } from "@testing-library/react";
import type { FormEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Fund, ProcedureType } from "@/bindings";
import { useAppStore } from "@/lib/appStore";
import { makePatient } from "@/tests/patient.factory";
import { useProcedureFormModal } from "./useProcedureFormModal";

vi.mock("@/features/procedure/api/gateway", () => ({
  addProcedure: vi.fn(),
  updateProcedure: vi.fn(),
  createNewPatient: vi.fn(),
  readAllProcedures: vi.fn(),
}));

// --- Test data ---

const mockProcedureTypes: ProcedureType[] = [
  { id: "pt1", name: "Consultation", default_amount: 25000, category: null },
  { id: "pt2", name: "Radio", default_amount: 50000, category: null },
];

const mockFunds: Fund[] = [
  { id: "f1", fund_identifier: "CPAM", name: "CPAM France", temp_id: null },
];

const mockPatientFull = makePatient({
  id: "p1",
  latest_procedure_type: "pt2",
  latest_fund: "f1",
  latest_date: "2026-01-15",
  latest_procedure_amount: 42500,
});

const mockPatientEmpty = makePatient({ id: "p2" });

const makeHook = (
  overrides: Parameters<typeof useProcedureFormModal>[0] = { mode: "create", onClose: vi.fn() },
) => renderHook(() => useProcedureFormModal(overrides));

// --- Setup ---

beforeEach(() => {
  useAppStore.setState({
    patients: [mockPatientFull, mockPatientEmpty],
    funds: mockFunds,
    procedureTypes: mockProcedureTypes,
  });
  vi.clearAllMocks();
});

// --- Create mode: auto-fill ---

describe("create mode — auto-fill on patient select", () => {
  it("fills fund, procedure type, date and amount from patient latest data", () => {
    const today = new Date().toISOString().split("T")[0];
    const { result } = makeHook({ mode: "create", onClose: vi.fn() });

    act(() => {
      result.current.handlePatientChange("p1");
    });

    expect(result.current.fundId).toBe("f1");
    expect(result.current.procedureTypeId).toBe("pt2");
    expect(result.current.procedureDate).toBe(today);
    expect(result.current.procedureAmount).toBe(42.5);
  });

  it("does not overwrite fund if already set", () => {
    const { result } = makeHook({ mode: "create", onClose: vi.fn() });

    act(() => {
      result.current.setFundId("f-other");
    });
    act(() => {
      result.current.handlePatientChange("p1");
    });

    expect(result.current.fundId).toBe("f-other");
  });

  it("does not overwrite date if already set", () => {
    const { result } = makeHook({ mode: "create", onClose: vi.fn() });

    act(() => {
      result.current.setProcedureDate("2025-12-01");
    });
    act(() => {
      result.current.handlePatientChange("p1");
    });

    expect(result.current.procedureDate).toBe("2025-12-01");
  });

  it("does not overwrite amount if already set", () => {
    const { result } = makeHook({ mode: "create", onClose: vi.fn() });

    act(() => {
      result.current.setProcedureAmount(99.0);
    });
    act(() => {
      result.current.handlePatientChange("p1");
    });

    expect(result.current.procedureAmount).toBe(99.0);
  });

  it("leaves fields empty when patient has no latest data", () => {
    const { result } = makeHook({ mode: "create", onClose: vi.fn() });

    act(() => {
      result.current.handlePatientChange("p2");
    });

    expect(result.current.fundId).toBe("");
    expect(result.current.procedureTypeId).toBe("");
    expect(result.current.procedureAmount).toBeNull();
  });
});

// --- Patient combobox items: SSN priority ---

describe("patientItems — hasSsn flag", () => {
  it("sets hasSsn=true for patients with a non-empty ssn and false otherwise", () => {
    const withSsn = { ...makePatient(), id: "p-ssn", ssn: "1234567890123" };
    const withoutSsn = { ...makePatient(), id: "p-no-ssn", ssn: null };
    const emptyStringSsn = { ...makePatient(), id: "p-empty", ssn: "" };
    useAppStore.setState({
      patients: [withSsn, withoutSsn, emptyStringSsn],
      funds: mockFunds,
      procedureTypes: mockProcedureTypes,
    });

    const { result } = makeHook();

    const items = result.current.patientItems;
    expect(items.find((i) => i.id === "p-ssn")?.hasSsn).toBe(true);
    expect(items.find((i) => i.id === "p-no-ssn")?.hasSsn).toBe(false);
    expect(items.find((i) => i.id === "p-empty")?.hasSsn).toBe(false);
  });
});

// --- Create mode: gateway args ---

describe("create mode — gateway arguments on submit", () => {
  it("calls addProcedure with correct positional arguments", async () => {
    const { addProcedure } = await import("@/features/procedure/api/gateway");
    const mockAdd = vi.mocked(addProcedure);
    mockAdd.mockResolvedValueOnce({
      id: "proc1",
      patient_id: "p1",
      fund_id: "f1",
      procedure_type_id: "pt2",
      procedure_date: "2026-03-01",
      billed_amount: 42500,
      payment_method: "NONE",
      confirmed_payment_date: "",
      payment_status: "CREATED",
      paid_amount: null,
    });

    const { result } = makeHook({ mode: "create", onClose: vi.fn() });

    act(() => {
      result.current.handlePatientChange("p1");
      result.current.setProcedureDate("2026-03-01");
    });

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as FormEvent);
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
      billed_amount: null,
      payment_method: "NONE",
      confirmed_payment_date: "",
      payment_status: "CREATED",
      paid_amount: null,
    });

    const { result } = makeHook({ mode: "create", onClose: vi.fn() });

    act(() => {
      result.current.handlePatientChange("p2");
      result.current.setProcedureTypeId("pt1");
      result.current.setProcedureDate("2026-03-01");
    });

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as FormEvent);
    });

    expect(mockAdd).toHaveBeenCalledWith("p2", null, "pt1", "2026-03-01", null);
  });
});

// --- Create mode: reset after submit ---

describe("create mode — reset after successful submit", () => {
  it("resets all fields to initial values", async () => {
    const { addProcedure } = await import("@/features/procedure/api/gateway");
    vi.mocked(addProcedure).mockResolvedValueOnce({
      id: "proc1",
      patient_id: "p1",
      fund_id: "f1",
      procedure_type_id: "pt2",
      procedure_date: "2026-03-01",
      billed_amount: 42500,
      payment_method: "NONE",
      confirmed_payment_date: "",
      payment_status: "CREATED",
      paid_amount: null,
    });

    const { result } = makeHook({ mode: "create", onClose: vi.fn() });

    act(() => {
      result.current.handlePatientChange("p1");
      result.current.setProcedureDate("2026-03-01");
    });

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as FormEvent);
    });

    expect(result.current.patientId).toBe("");
    expect(result.current.fundId).toBe("");
    expect(result.current.procedureTypeId).toBe("");
    expect(result.current.procedureDate).toBe("");
    expect(result.current.procedureAmount).toBeNull();
  });
});

// --- Create mode: error handling ---

describe("create mode — error handling", () => {
  it("shows error toast on gateway failure", async () => {
    const { toastService } = await import("@/core/snackbar");
    const { addProcedure } = await import("@/features/procedure/api/gateway");
    vi.mocked(addProcedure).mockRejectedValueOnce(new Error("Network error"));

    const { result } = makeHook({ mode: "create", onClose: vi.fn() });

    act(() => {
      result.current.handlePatientChange("p1");
      result.current.setProcedureDate("2026-03-01");
    });

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as FormEvent);
    });

    expect(toastService.show).toHaveBeenCalledWith("error", "Network error");
  });
});

// --- Edit mode ---

describe("edit mode — initializes from procedure", () => {
  it("pre-fills form fields from the provided procedure", () => {
    const procedure = {
      id: "proc-edit",
      patient_id: "p1",
      fund_id: "f1",
      procedure_type_id: "pt2",
      procedure_date: "2026-02-10",
      billed_amount: 50000,
      payment_method: "CASH" as const,
      confirmed_payment_date: "2026-02-15",
      payment_status: "CREATED" as const,
      paid_amount: 50000,
    };

    const { result } = makeHook({ mode: "edit", procedure, onClose: vi.fn() });

    expect(result.current.patientId).toBe("p1");
    expect(result.current.fundId).toBe("f1");
    expect(result.current.procedureTypeId).toBe("pt2");
    expect(result.current.procedureDate).toBe("2026-02-10");
    expect(result.current.procedureAmount).toBe(50);
  });
});

describe("view mode — calls updateProcedure with only procedure_type_id changed", () => {
  it("passes through all original fields except procedure_type_id", async () => {
    const { updateProcedure } = await import("@/features/procedure/api/gateway");
    vi.mocked(updateProcedure).mockResolvedValueOnce({
      id: "proc-view",
      patient_id: "p1",
      fund_id: "f1",
      procedure_type_id: "pt1",
      procedure_date: "2026-02-10",
      billed_amount: 50000,
      payment_method: "CASH",
      confirmed_payment_date: "2026-02-15",
      payment_status: "RECONCILED",
      paid_amount: 50000,
    });

    const procedure = {
      id: "proc-view",
      patient_id: "p1",
      fund_id: "f1",
      procedure_type_id: "pt2",
      procedure_date: "2026-02-10",
      billed_amount: 50000,
      payment_method: "CASH" as const,
      confirmed_payment_date: "2026-02-15",
      payment_status: "RECONCILED" as const,
      paid_amount: 50000,
    };

    const { result } = makeHook({ mode: "view", procedure, onClose: vi.fn() });

    act(() => {
      result.current.setProcedureTypeId("pt1");
    });

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as FormEvent);
    });

    expect(updateProcedure).toHaveBeenCalledWith({
      id: "proc-view",
      patient_id: "p1",
      fund_id: "f1",
      procedure_type_id: "pt1",
      procedure_date: "2026-02-10",
      billed_amount: 50000,
      payment_method: "CASH",
      confirmed_payment_date: "2026-02-15",
      paid_amount: 50000,
      payment_status: "RECONCILED",
    });
  });
});

describe("view mode — confirmed_payment_date empty string is sent as null", () => {
  it("converts empty confirmed_payment_date to null in view mode", async () => {
    const { updateProcedure } = await import("@/features/procedure/api/gateway");
    vi.mocked(updateProcedure).mockResolvedValueOnce({
      id: "proc-view-nodate",
      patient_id: "p1",
      fund_id: null,
      procedure_type_id: "pt1",
      procedure_date: "2026-02-10",
      billed_amount: 50000,
      payment_method: "NONE",
      confirmed_payment_date: "",
      payment_status: "CREATED",
      paid_amount: null,
    });

    const procedure = {
      id: "proc-view-nodate",
      patient_id: "p1",
      fund_id: null,
      procedure_type_id: "pt2",
      procedure_date: "2026-02-10",
      billed_amount: 50000,
      payment_method: "NONE" as const,
      confirmed_payment_date: "",
      payment_status: "CREATED" as const,
      paid_amount: null,
    };

    const { result } = makeHook({ mode: "view", procedure, onClose: vi.fn() });

    act(() => {
      result.current.setProcedureTypeId("pt1");
    });

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as FormEvent);
    });

    expect(updateProcedure).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmed_payment_date: null,
      }),
    );
  });
});

describe("patientItems — formatted with INS for ComboboxField", () => {
  it("includes name and SSN in parentheses for each patient", () => {
    const { result } = makeHook({ mode: "create", onClose: vi.fn() });
    // Both mock patients use the factory default SSN "1234567890123" and name "Marie Dupont"
    const item = result.current.patientItems.find((i) => i.id === mockPatientFull.id);
    expect(item?.label).toBe("Marie Dupont (1234567890123)");
  });

  it("all patients from store are represented with id and label", () => {
    const { result } = makeHook({ mode: "create", onClose: vi.fn() });
    expect(result.current.patientItems).toHaveLength(2);
    expect(result.current.patientItems.every((i) => i.id && i.label)).toBe(true);
  });
});

describe("edit mode — calls updateProcedure on submit", () => {
  it("calls updateProcedure with correct fields", async () => {
    const { updateProcedure } = await import("@/features/procedure/api/gateway");
    vi.mocked(updateProcedure).mockResolvedValueOnce({
      id: "proc-edit",
      patient_id: "p1",
      fund_id: "f1",
      procedure_type_id: "pt1",
      procedure_date: "2026-02-10",
      billed_amount: 25000,
      payment_method: "NONE",
      confirmed_payment_date: "",
      payment_status: "CREATED",
      paid_amount: null,
    });

    const procedure = {
      id: "proc-edit",
      patient_id: "p1",
      fund_id: "f1",
      procedure_type_id: "pt2",
      procedure_date: "2026-02-10",
      billed_amount: 50000,
      payment_method: "NONE" as const,
      confirmed_payment_date: "",
      payment_status: "CREATED" as const,
      paid_amount: null,
    };

    const { result } = makeHook({ mode: "edit", procedure, onClose: vi.fn() });

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as FormEvent);
    });

    expect(updateProcedure).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "proc-edit",
        patient_id: "p1",
        fund_id: "f1",
        procedure_type_id: "pt2",
        procedure_date: "2026-02-10",
        billed_amount: 50000,
        // Payment fields passed through unchanged from original procedure (PRO-050)
        payment_method: "NONE",
        confirmed_payment_date: null,
        paid_amount: null,
        payment_status: "CREATED",
      }),
    );
  });
});

describe("create mode — validation errors set fieldErrors", () => {
  it("sets fieldErrors for all missing required fields and shows toast", async () => {
    const { toastService } = await import("@/core/snackbar");

    const { result } = makeHook({ mode: "create", onClose: vi.fn() });

    // Submit with all fields empty
    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as FormEvent);
    });

    expect(result.current.fieldErrors.patientId).toBeTruthy();
    expect(result.current.fieldErrors.procedureTypeId).toBeTruthy();
    expect(result.current.fieldErrors.procedureDate).toBeTruthy();
    expect(toastService.show).toHaveBeenCalledWith("error", expect.any(String));
  });
});

describe("create mode — handlePatientCreated", () => {
  it("sets patientId and clears patientId error on success", async () => {
    const { createNewPatient } = await import("@/features/procedure/api/gateway");
    const createdPatient = makePatient({ id: "new-p" });
    vi.mocked(createNewPatient).mockResolvedValue(createdPatient);

    const { result } = makeHook({ mode: "create", onClose: vi.fn() });

    // Force a patientId error first
    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as FormEvent);
    });
    expect(result.current.fieldErrors.patientId).toBeTruthy();

    await act(async () => {
      await result.current.handlePatientCreated({ name: "Alice" });
    });

    expect(result.current.patientId).toBe("new-p");
    expect(result.current.fieldErrors.patientId).toBeUndefined();
  });

  it("shows error toast when createNewPatient throws", async () => {
    const { createNewPatient } = await import("@/features/procedure/api/gateway");
    const { toastService } = await import("@/core/snackbar");
    vi.mocked(createNewPatient).mockRejectedValue(new Error("create failed"));

    const { result } = makeHook({ mode: "create", onClose: vi.fn() });

    await act(async () => {
      await result.current.handlePatientCreated({ name: "Alice" });
    });

    expect(toastService.show).toHaveBeenCalledWith("error", expect.any(String));
  });
});
