import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCacheStore } from "@/infra/cache/store";
import { makePatient } from "@/tests/patient.factory";
import { makeProcedure } from "@/tests/procedure.factory";
import { toastService } from "@/ui/components/snackbar";
import { useProcedureSelectionModal, useSelectedProcedures } from "./useSelectProcedureModal";

vi.mock("../gateway", () => ({
  getUnpaidProceduresByFund: vi.fn(),
  createFundPayment: vi.fn(),
  deleteFundPaymentGroup: vi.fn(),
  updatePaymentGroupWithProcedures: vi.fn(),
  getFundPaymentGroupEditData: vi.fn(),
}));

import { getUnpaidProceduresByFund } from "../gateway";

const mockFetch = vi.mocked(getUnpaidProceduresByFund);
const mockToast = vi.mocked(toastService.show);

const NO_SELECTION: string[] = [];

describe("useSelectedProcedures", () => {
  it("toggleSelection adds a procedure to the selection", () => {
    const { result } = renderHook(() => useSelectedProcedures());
    const proc = makeProcedure({ id: "p1" });

    act(() => result.current.toggleSelection(proc));

    expect(result.current.isSelected("p1")).toBe(true);
    expect(result.current.stats.count).toBe(1);
  });

  it("toggleSelection removes the procedure when called again", () => {
    const { result } = renderHook(() => useSelectedProcedures());
    const proc = makeProcedure({ id: "p1" });

    act(() => result.current.toggleSelection(proc));
    act(() => result.current.toggleSelection(proc));

    expect(result.current.isSelected("p1")).toBe(false);
    expect(result.current.stats.count).toBe(0);
  });

  it("stats.total sums billed_amount across selected procedures", () => {
    const { result } = renderHook(() => useSelectedProcedures());
    const proc1 = makeProcedure({ id: "p1", billed_amount: 10000 });
    const proc2 = makeProcedure({ id: "p2", billed_amount: 25000 });

    act(() => result.current.toggleSelection(proc1));
    act(() => result.current.toggleSelection(proc2));

    expect(result.current.stats.total).toBe(35000);
    expect(result.current.stats.count).toBe(2);
  });

  it("getSelectedProcedures returns all toggled procedures", () => {
    const { result } = renderHook(() => useSelectedProcedures());
    const proc1 = makeProcedure({ id: "p1" });
    const proc2 = makeProcedure({ id: "p2" });

    act(() => result.current.toggleSelection(proc1));
    act(() => result.current.toggleSelection(proc2));

    const selected = result.current.getSelectedProcedures();
    expect(selected).toHaveLength(2);
    expect(selected.map((p) => p.id)).toContain("p1");
    expect(selected.map((p) => p.id)).toContain("p2");
  });

  it("reset clears selection and stats", () => {
    const { result } = renderHook(() => useSelectedProcedures());
    const proc = makeProcedure({ id: "p1" });

    act(() => result.current.toggleSelection(proc));
    act(() => result.current.reset());

    expect(result.current.isSelected("p1")).toBe(false);
    expect(result.current.stats.count).toBe(0);
  });
});

describe("useProcedureSelectionModal — preloaded procedures", () => {
  const onConfirm = vi.fn();
  const preloaded = [
    makeProcedure({ id: "p1", procedure_date: "2026-01-15" }),
    makeProcedure({ id: "p2", procedure_date: "2026-02-20" }),
  ];
  const selectionP1 = ["p1"];

  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ patients: [] });
  });

  it("sets availableProcedures and pre-selects those in initialSelectionIds", async () => {
    const { result } = renderHook(() =>
      useProcedureSelectionModal({
        isOpen: true,
        fundId: "",
        initialSelectionIds: selectionP1,
        onConfirm,
        preloadedProcedures: preloaded,
      }),
    );

    await waitFor(() => expect(result.current.filteredProcedures).toHaveLength(2));

    expect(result.current.isSelected("p1")).toBe(true);
    expect(result.current.isSelected("p2")).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("handleConfirm calls onConfirm with currently selected procedures", async () => {
    const singleProc = [makeProcedure({ id: "p3" })];

    const { result } = renderHook(() =>
      useProcedureSelectionModal({
        isOpen: true,
        fundId: "",
        initialSelectionIds: NO_SELECTION,
        onConfirm,
        preloadedProcedures: singleProc,
      }),
    );

    await waitFor(() => expect(result.current.filteredProcedures).toHaveLength(1));

    act(() => result.current.toggleSelection(singleProc[0]!));
    act(() => result.current.handleConfirm());

    expect(onConfirm).toHaveBeenCalledWith([singleProc[0]]);
  });
});

describe("useProcedureSelectionModal — gateway fetch", () => {
  const onConfirm = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ patients: [] });
  });

  it("fetches procedures from gateway when isOpen=true and fundId is set", async () => {
    const proc1 = makeProcedure({ id: "p1", procedure_date: "2026-01-15" });
    mockFetch.mockResolvedValue({ success: true, data: [proc1] });

    const { result } = renderHook(() =>
      useProcedureSelectionModal({
        isOpen: true,
        fundId: "f1",
        initialSelectionIds: NO_SELECTION,
        onConfirm,
      }),
    );

    await waitFor(() => expect(result.current.filteredProcedures).toHaveLength(1));

    expect(mockFetch).toHaveBeenCalledWith("f1");
    expect(result.current.filteredProcedures[0]?.id).toBe("p1");
  });

  it("does not fetch when isOpen=false", () => {
    renderHook(() =>
      useProcedureSelectionModal({
        isOpen: false,
        fundId: "f1",
        initialSelectionIds: NO_SELECTION,
        onConfirm,
      }),
    );

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not fetch when fundId is empty and no preloaded procedures", () => {
    renderHook(() =>
      useProcedureSelectionModal({
        isOpen: true,
        fundId: "",
        initialSelectionIds: NO_SELECTION,
        onConfirm,
      }),
    );

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("shows error toast when gateway fetch fails", async () => {
    mockFetch.mockResolvedValue({ success: false, error: "load failed" });

    renderHook(() =>
      useProcedureSelectionModal({
        isOpen: true,
        fundId: "f1",
        initialSelectionIds: NO_SELECTION,
        onConfirm,
      }),
    );

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith("error", expect.any(String)));
  });

  it("filteredProcedures shows only procedures matching selectedMonth", async () => {
    const proc1 = makeProcedure({ id: "p1", procedure_date: "2026-01-15" });
    const proc2 = makeProcedure({ id: "p2", procedure_date: "2026-02-20" });
    mockFetch.mockResolvedValue({ success: true, data: [proc1, proc2] });

    const { result } = renderHook(() =>
      useProcedureSelectionModal({
        isOpen: true,
        fundId: "f1",
        initialSelectionIds: NO_SELECTION,
        onConfirm,
      }),
    );

    await waitFor(() => expect(result.current.filteredProcedures).toHaveLength(2));

    act(() => result.current.setSelectedMonth("2026-01"));

    expect(result.current.filteredProcedures).toHaveLength(1);
    expect(result.current.filteredProcedures[0]?.id).toBe("p1");
  });

  it("monthYearOptions are derived from available procedure dates in reverse order", async () => {
    const proc1 = makeProcedure({ id: "p1", procedure_date: "2026-01-15" });
    const proc2 = makeProcedure({ id: "p2", procedure_date: "2026-02-20" });
    mockFetch.mockResolvedValue({ success: true, data: [proc1, proc2] });

    const { result } = renderHook(() =>
      useProcedureSelectionModal({
        isOpen: true,
        fundId: "f1",
        initialSelectionIds: NO_SELECTION,
        onConfirm,
      }),
    );

    await waitFor(() => expect(result.current.monthYearOptions).toHaveLength(2));

    expect(result.current.monthYearOptions[0]).toBe("2026-02");
    expect(result.current.monthYearOptions[1]).toBe("2026-01");
  });
});

describe("useProcedureSelectionModal — getPatientName", () => {
  const onConfirm = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the patient name when patient is found in store", () => {
    useCacheStore.setState({
      patients: [{ ...makePatient(), id: "p-1", name: "Jean Dupont" }],
    });

    const { result } = renderHook(() =>
      useProcedureSelectionModal({
        isOpen: false,
        fundId: "",
        initialSelectionIds: NO_SELECTION,
        onConfirm,
      }),
    );

    expect(result.current.getPatientName("p-1")).toBe("Jean Dupont");
  });

  it("returns the patientId when patient is not found in store", () => {
    useCacheStore.setState({ patients: [] });

    const { result } = renderHook(() =>
      useProcedureSelectionModal({
        isOpen: false,
        fundId: "",
        initialSelectionIds: NO_SELECTION,
        onConfirm,
      }),
    );

    expect(result.current.getPatientName("unknown-id")).toBe("unknown-id");
  });
});
