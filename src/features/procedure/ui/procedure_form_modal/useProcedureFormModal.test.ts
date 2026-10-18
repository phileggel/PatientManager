import { act, renderHook } from "@testing-library/react";
import type { FormEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Fund, ProcedureType } from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";
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
  useCacheStore.setState({
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
    expect(result.current.billedAmount).toBe(42.5);
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
      result.current.setBilledAmount(99.0);
    });
    act(() => {
      result.current.handlePatientChange("p1");
    });

    expect(result.current.billedAmount).toBe(99.0);
  });

  it("leaves fields empty when patient has no latest data", () => {
    const { result } = makeHook({ mode: "create", onClose: vi.fn() });

    act(() => {
      result.current.handlePatientChange("p2");
    });

    expect(result.current.fundId).toBe("");
    expect(result.current.procedureTypeId).toBe("");
    expect(result.current.billedAmount).toBeNull();
  });

  it("does not overwrite procedure type if already set (PRO-020)", () => {
    const { result } = makeHook({ mode: "create", onClose: vi.fn() });

    act(() => {
      result.current.handleProcedureTypeChange("pt1");
    });
    act(() => {
      result.current.handlePatientChange("p1");
    });

    expect(result.current.procedureTypeId).toBe("pt1");
  });
});

// --- Create mode: PRO-025 amount propagation on type change ---

describe("create mode — PRO-025 amount propagation on type change", () => {
  it("pre-fills amount from type default_amount when amount is not initialized", () => {
    const { result } = makeHook({ mode: "create", onClose: vi.fn() });

    act(() => {
      result.current.handleProcedureTypeChange("pt1");
    });

    expect(result.current.procedureTypeId).toBe("pt1");
    expect(result.current.billedAmount).toBe(25);
  });

  it("does not overwrite amount once the user has entered a value", () => {
    const { result } = makeHook({ mode: "create", onClose: vi.fn() });

    act(() => {
      result.current.handleProcedureTypeChange("pt1");
    });
    act(() => {
      result.current.setBilledAmount(99);
    });
    act(() => {
      result.current.handleProcedureTypeChange("pt2");
    });

    expect(result.current.procedureTypeId).toBe("pt2");
    expect(result.current.billedAmount).toBe(99);
  });

  it("clearing the amount returns it to not-initialized state and re-enables propagation", () => {
    const { result } = makeHook({ mode: "create", onClose: vi.fn() });

    act(() => {
      result.current.handleProcedureTypeChange("pt1");
    });
    act(() => {
      result.current.setBilledAmount(null);
    });
    act(() => {
      result.current.handleProcedureTypeChange("pt2");
    });

    expect(result.current.billedAmount).toBe(50);
  });

  it("does not propagate in edit mode", () => {
    const { result } = makeHook({ mode: "edit", procedure: null, onClose: vi.fn() });

    act(() => {
      result.current.handleProcedureTypeChange("pt1");
    });

    expect(result.current.procedureTypeId).toBe("pt1");
    expect(result.current.billedAmount).toBeNull();
  });

  it("does nothing when the id is empty (clearing the type field)", () => {
    const { result } = makeHook({ mode: "create", onClose: vi.fn() });

    act(() => {
      result.current.handleProcedureTypeChange("");
    });

    expect(result.current.procedureTypeId).toBe("");
    expect(result.current.billedAmount).toBeNull();
  });

  it("leaves amount untouched when the id matches no known procedure type", () => {
    const { result } = makeHook({ mode: "create", onClose: vi.fn() });

    act(() => {
      result.current.handleProcedureTypeChange("pt-unknown");
    });

    expect(result.current.procedureTypeId).toBe("pt-unknown");
    expect(result.current.billedAmount).toBeNull();
  });
});

// --- Patient combobox items: SSN priority ---

describe("patientItems — hasSsn flag", () => {
  it("sets hasSsn=true for patients with a non-empty ssn and false otherwise", () => {
    const withSsn = { ...makePatient(), id: "p-ssn", ssn: "1234567890123" };
    const withoutSsn = { ...makePatient(), id: "p-no-ssn", ssn: null };
    const emptyStringSsn = { ...makePatient(), id: "p-empty", ssn: "" };
    useCacheStore.setState({
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
      success: true,
      data: {
        id: "proc1",
        patient_id: "p1",
        fund_id: "f1",
        procedure_type_id: "pt2",
        procedure_date: "2026-03-01",
        billed_amount: 42500,
        payment_method: "NONE",
        fund_reconciliation_date: "",

        confirmed_payment_date: "",
        payment_status: "CREATED",
        paid_amount: null,
      },
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
      success: true,
      data: {
        id: "proc2",
        patient_id: "p2",
        fund_id: null,
        procedure_type_id: "pt1",
        procedure_date: "2026-03-01",
        billed_amount: 0,
        payment_method: "NONE",
        fund_reconciliation_date: "",

        confirmed_payment_date: "",
        payment_status: "CREATED",
        paid_amount: null,
      },
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

    expect(mockAdd).toHaveBeenCalledWith("p2", null, "pt1", "2026-03-01", 0);
  });

  it("sends 0 for billed_amount when the form was never touched (PRO-120)", async () => {
    const { addProcedure } = await import("@/features/procedure/api/gateway");
    const mockAdd = vi.mocked(addProcedure);
    mockAdd.mockResolvedValueOnce({
      success: true,
      data: {
        id: "proc3",
        patient_id: "p2",
        fund_id: null,
        procedure_type_id: "pt1",
        procedure_date: "2026-03-01",
        billed_amount: 0,
        payment_method: "NONE",
        fund_reconciliation_date: "",
        confirmed_payment_date: "",
        payment_status: "CREATED",
        paid_amount: null,
      },
    });

    const { result } = makeHook({ mode: "create", onClose: vi.fn() });

    act(() => {
      result.current.handlePatientChange("p2");
      result.current.setProcedureTypeId("pt1");
      result.current.setProcedureDate("2026-03-01");
      result.current.setBilledAmount(null);
    });

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as FormEvent);
    });

    expect(mockAdd).toHaveBeenCalledWith("p2", null, "pt1", "2026-03-01", 0);
  });
});

// --- Create mode: reset after submit ---

describe("create mode — reset after successful submit", () => {
  it("resets all fields to initial values", async () => {
    const { addProcedure } = await import("@/features/procedure/api/gateway");
    vi.mocked(addProcedure).mockResolvedValueOnce({
      success: true,
      data: {
        id: "proc1",
        patient_id: "p1",
        fund_id: "f1",
        procedure_type_id: "pt2",
        procedure_date: "2026-03-01",
        billed_amount: 42500,
        payment_method: "NONE",
        fund_reconciliation_date: "",

        confirmed_payment_date: "",
        payment_status: "CREATED",
        paid_amount: null,
      },
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
    expect(result.current.billedAmount).toBeNull();
  });
});

// --- Create mode: error handling ---

describe("create mode — error handling", () => {
  it("shows error toast on gateway failure", async () => {
    const { toastService } = await import("@/ui/components/snackbar");
    const { addProcedure } = await import("@/features/procedure/api/gateway");
    vi.mocked(addProcedure).mockResolvedValueOnce({
      success: false,
      error: { code: "DatabaseError" },
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

    expect(toastService.show).toHaveBeenCalledWith("error", expect.any(String));
  });
});

// --- View mode + Edit mode: error handling on gateway failure ---

describe("view mode — error handling", () => {
  it("shows error toast and clears loading when updateProcedure fails", async () => {
    const { toastService } = await import("@/ui/components/snackbar");
    const { updateProcedure } = await import("@/features/procedure/api/gateway");
    vi.mocked(updateProcedure).mockResolvedValueOnce({
      success: false,
      error: { code: "ProcedureNotFound", procedure_id: "proc-1" },
    });

    const procedure = {
      id: "proc-view",
      patient_id: "p1",
      fund_id: "f1",
      procedure_type_id: "pt2",
      procedure_date: "2026-02-10",
      billed_amount: 50000,
      payment_method: "CASH" as const,
      fund_reconciliation_date: "",

      confirmed_payment_date: "2026-02-15",
      payment_status: "RECONCILED" as const,
      paid_amount: 50000,
    };

    const { result } = makeHook({ mode: "view", procedure, onClose: vi.fn() });

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as FormEvent);
    });

    expect(toastService.show).toHaveBeenCalledWith("error", expect.any(String));
    expect(result.current.loading).toBe(false);
  });
});

describe("edit mode — error handling", () => {
  it("shows error toast and clears loading when updateProcedure fails", async () => {
    const { toastService } = await import("@/ui/components/snackbar");
    const { updateProcedure } = await import("@/features/procedure/api/gateway");
    vi.mocked(updateProcedure).mockResolvedValueOnce({
      success: false,
      error: { code: "ProcedureNotFound", procedure_id: "proc-1" },
    });

    const procedure = {
      id: "proc-edit",
      patient_id: "p1",
      fund_id: "f1",
      procedure_type_id: "pt2",
      procedure_date: "2026-02-10",
      billed_amount: 50000,
      payment_method: "NONE" as const,
      fund_reconciliation_date: "",

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

    expect(toastService.show).toHaveBeenCalledWith("error", expect.any(String));
    expect(result.current.loading).toBe(false);
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
      fund_reconciliation_date: "",

      confirmed_payment_date: "2026-02-15",
      payment_status: "CREATED" as const,
      paid_amount: 50000,
    };

    const { result } = makeHook({ mode: "edit", procedure, onClose: vi.fn() });

    expect(result.current.patientId).toBe("p1");
    expect(result.current.fundId).toBe("f1");
    expect(result.current.procedureTypeId).toBe("pt2");
    expect(result.current.procedureDate).toBe("2026-02-10");
    expect(result.current.billedAmount).toBe(50);
  });
});

describe("view mode — calls updateProcedure with only procedure_type_id changed", () => {
  it("passes through all original fields except procedure_type_id", async () => {
    const { updateProcedure } = await import("@/features/procedure/api/gateway");
    vi.mocked(updateProcedure).mockResolvedValueOnce({
      success: true,
      data: {
        outcome: "Updated",
        procedure: {
          id: "proc-view",
          patient_id: "p1",
          fund_id: "f1",
          procedure_type_id: "pt1",
          procedure_date: "2026-02-10",
          billed_amount: 50000,
          payment_method: "CASH",
          fund_reconciliation_date: "",

          confirmed_payment_date: "2026-02-15",
          payment_status: "RECONCILED",
          paid_amount: 50000,
        },
      },
    });

    const procedure = {
      id: "proc-view",
      patient_id: "p1",
      fund_id: "f1",
      procedure_type_id: "pt2",
      procedure_date: "2026-02-10",
      billed_amount: 50000,
      payment_method: "CASH" as const,
      fund_reconciliation_date: "",

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
      // Empty-string dates on the procedure are sent as null over the wire.
      fund_reconciliation_date: null,
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
      success: true,
      data: {
        outcome: "Updated",
        procedure: {
          id: "proc-view-nodate",
          patient_id: "p1",
          fund_id: null,
          procedure_type_id: "pt1",
          procedure_date: "2026-02-10",
          billed_amount: 50000,
          payment_method: "NONE",
          fund_reconciliation_date: "",

          confirmed_payment_date: "",
          payment_status: "CREATED",
          paid_amount: null,
        },
      },
    });

    const procedure = {
      id: "proc-view-nodate",
      patient_id: "p1",
      fund_id: null,
      procedure_type_id: "pt2",
      procedure_date: "2026-02-10",
      billed_amount: 50000,
      payment_method: "NONE" as const,
      fund_reconciliation_date: "",

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
        fund_reconciliation_date: null,
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
      success: true,
      data: {
        outcome: "Updated",
        procedure: {
          id: "proc-edit",
          patient_id: "p1",
          fund_id: "f1",
          procedure_type_id: "pt1",
          procedure_date: "2026-02-10",
          billed_amount: 25000,
          payment_method: "NONE",
          fund_reconciliation_date: "",

          confirmed_payment_date: "",
          payment_status: "CREATED",
          paid_amount: null,
        },
      },
    });

    const procedure = {
      id: "proc-edit",
      patient_id: "p1",
      fund_id: "f1",
      procedure_type_id: "pt2",
      procedure_date: "2026-02-10",
      billed_amount: 50000,
      payment_method: "NONE" as const,
      fund_reconciliation_date: "",

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
        // Payment fields passed through unchanged from original procedure (PRO-050).
        // Empty-string dates on the procedure are sent as null over the wire.
        payment_method: "NONE",
        fund_reconciliation_date: null,
        confirmed_payment_date: null,
        paid_amount: null,
        payment_status: "CREATED",
      }),
    );
  });
});

describe("TODO-026 — the backend judges the form, its refusals shown under each field", () => {
  const submit = (result: { current: ReturnType<typeof useProcedureFormModal> }) =>
    act(async () => {
      await result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as FormEvent);
    });

  it("PRO-120: an empty form is sent, and each refused field gets its own message", async () => {
    const { toastService } = await import("@/ui/components/snackbar");
    const { addProcedure } = await import("@/features/procedure/api/gateway");
    vi.mocked(addProcedure).mockResolvedValueOnce({
      success: false,
      error: {
        code: "ProcedureInvalid",
        reasons: ["PatientIdEmpty", "ProcedureTypeIdEmpty", "ProcedureDateEmpty"],
      },
    });
    const { result } = makeHook({ mode: "create", onClose: vi.fn() });

    await submit(result);

    expect(addProcedure).toHaveBeenCalledTimes(1);
    expect(result.current.fieldErrors).toEqual({
      patientId: "Choose a patient.",
      procedureTypeId: "Choose a procedure type.",
      procedureDate: "Enter the procedure date.",
    });
    expect(toastService.show).toHaveBeenCalledWith("error", expect.any(String));
  });

  it("PRO-120: a malformed date gets its own message", async () => {
    const { addProcedure } = await import("@/features/procedure/api/gateway");
    vi.mocked(addProcedure).mockResolvedValueOnce({
      success: false,
      error: { code: "ProcedureInvalid", reasons: ["ProcedureDateInvalid"] },
    });
    const { result } = makeHook({ mode: "create", onClose: vi.fn() });

    await submit(result);

    expect(result.current.fieldErrors).toEqual({ procedureDate: "Enter a valid date." });
  });

  it("PRO-120: editing a refused field clears its message only", async () => {
    const { addProcedure } = await import("@/features/procedure/api/gateway");
    vi.mocked(addProcedure).mockResolvedValueOnce({
      success: false,
      error: { code: "ProcedureInvalid", reasons: ["ProcedureTypeIdEmpty", "ProcedureDateEmpty"] },
    });
    const { result } = makeHook({ mode: "create", onClose: vi.fn() });
    await submit(result);

    act(() => {
      result.current.setProcedureDate("2026-10-18");
    });

    expect(result.current.fieldErrors).toEqual({ procedureTypeId: "Choose a procedure type." });
  });

  it("PRO-122: a new submit clears the earlier messages, and another refusal puts none at a field", async () => {
    const { addProcedure } = await import("@/features/procedure/api/gateway");
    vi.mocked(addProcedure)
      .mockResolvedValueOnce({
        success: false,
        error: { code: "ProcedureInvalid", reasons: ["PatientIdEmpty"] },
      })
      .mockResolvedValueOnce({
        success: false,
        error: { code: "PatientNotFound", patient_id: "p9" },
      });
    const { result } = makeHook({ mode: "create", onClose: vi.fn() });
    await submit(result);
    expect(result.current.fieldErrors).toEqual({ patientId: "Choose a patient." });

    await submit(result);

    expect(result.current.fieldErrors).toEqual({});
  });

  it("PRO-123: choosing a procedure type clears its message", async () => {
    const { addProcedure } = await import("@/features/procedure/api/gateway");
    vi.mocked(addProcedure).mockResolvedValueOnce({
      success: false,
      error: { code: "ProcedureInvalid", reasons: ["ProcedureTypeIdEmpty"] },
    });
    const { result } = makeHook({ mode: "create", onClose: vi.fn() });
    await submit(result);

    act(() => {
      result.current.handleProcedureTypeChange("pt1");
    });

    expect(result.current.fieldErrors).toEqual({});
  });

  it("PRO-255: an edit answered unchanged closes the dialog without a message", async () => {
    const { toastService } = await import("@/ui/components/snackbar");
    const { updateProcedure } = await import("@/features/procedure/api/gateway");
    vi.mocked(updateProcedure).mockResolvedValueOnce({
      success: true,
      data: { outcome: "Unchanged" },
    });
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const procedure = {
      id: "proc-1",
      patient_id: "p1",
      fund_id: "f1",
      procedure_type_id: "pt1",
      procedure_date: "2026-02-10",
      billed_amount: 50000,
      payment_method: "NONE",
      payment_status: "CREATED",
      fund_reconciliation_date: "",
      confirmed_payment_date: "",
      paid_amount: null,
    } as const;
    const { result } = makeHook({ mode: "edit", procedure, onClose, onSuccess });

    await submit(result);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(toastService.show).not.toHaveBeenCalled();
  });
});

describe("create mode — handlePatientCreated", () => {
  it("sets patientId and clears patientId error on success", async () => {
    const { createNewPatient } = await import("@/features/procedure/api/gateway");
    const createdPatient = makePatient({ id: "new-p" });
    vi.mocked(createNewPatient).mockResolvedValue({ success: true, data: createdPatient });

    const { addProcedure } = await import("@/features/procedure/api/gateway");
    vi.mocked(addProcedure).mockResolvedValueOnce({
      success: false,
      error: { code: "ProcedureInvalid", reasons: ["PatientIdEmpty"] },
    });
    const { result } = makeHook({ mode: "create", onClose: vi.fn() });

    // A refused submit first puts a message under the patient
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

  it("TODO-026: a refusal that names no field keeps the new-patient form open with its reason", async () => {
    const { createNewPatient } = await import("@/features/procedure/api/gateway");
    const { toastService } = await import("@/ui/components/snackbar");
    vi.mocked(createNewPatient).mockResolvedValue({
      success: false,
      error: { code: "DatabaseError" },
    });

    const { result } = makeHook({ mode: "create", onClose: vi.fn() });

    let messages: Record<string, string> | undefined;
    await act(async () => {
      messages = await result.current.handlePatientCreated({ name: "Alice" });
    });

    expect(messages).toEqual({ submit: expect.any(String) });
    expect(toastService.show).not.toHaveBeenCalled();
  });
});

describe("TODO-026 — the new-patient form shows the backend's refusal under the name", () => {
  it("an empty name is answered under the name field, no toast", async () => {
    const { createNewPatient } = await import("@/features/procedure/api/gateway");
    const { toastService } = await import("@/ui/components/snackbar");
    vi.mocked(createNewPatient).mockResolvedValue({ success: false, error: { code: "NameEmpty" } });
    const { result } = makeHook({ mode: "create", onClose: vi.fn() });

    let fieldErrors: Record<string, string> | undefined;
    await act(async () => {
      fieldErrors = await result.current.handlePatientCreated({ name: "" });
    });

    expect(fieldErrors).toEqual({ name: "Enter the patient's name." });
    expect(toastService.show).not.toHaveBeenCalled();
  });
});
