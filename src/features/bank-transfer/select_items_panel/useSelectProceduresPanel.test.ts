import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DirectPaymentProcedureCandidate } from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";
import { makePatient } from "@/tests/patient.factory";
import { useSelectProceduresPanel } from "./useSelectProceduresPanel";

vi.mock("../gateway", () => ({
  getEligibleProceduresForDirectPayment: vi.fn(),
  getAllEligibleProceduresForDirectPayment: vi.fn(),
  readAllBankTransfers: vi.fn(),
  deleteTransferByType: vi.fn(),
  createBankTransfer: vi.fn(),
  updateBankTransfer: vi.fn(),
  getCashBankAccountId: vi.fn(),
  getUnsettledFundGroups: vi.fn(),
  getAllUnsettledFundGroups: vi.fn(),
  getFundGroupsByIds: vi.fn(),
  createFundTransfer: vi.fn(),
  updateFundTransfer: vi.fn(),
  getTransferFundGroupIds: vi.fn(),
  getProceduresByIds: vi.fn(),
  createDirectTransfer: vi.fn(),
  updateDirectTransfer: vi.fn(),
  getTransferProcedureIds: vi.fn(),
}));

import * as gateway from "../gateway";

const mockGetEligible = vi.mocked(gateway.getEligibleProceduresForDirectPayment);
const mockGetAllEligible = vi.mocked(gateway.getAllEligibleProceduresForDirectPayment);

const makeCandidate = (
  overrides?: Partial<DirectPaymentProcedureCandidate>,
): DirectPaymentProcedureCandidate => ({
  procedure_id: "proc-1",
  patient_id: "pat-1",
  procedure_date: "2026-03-10",
  billed_amount: 50000,
  ...overrides,
});

// Stable callback reference — avoids re-render loops from inline lambdas
const ON_CHANGE = vi.fn();

describe("useSelectProceduresPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({
      patients: [makePatient({ id: "pat-1" })],
    });
  });

  it("fetches eligible procedures when transferDate is set", async () => {
    const candidate = makeCandidate();
    mockGetEligible.mockResolvedValue({ success: true, data: [candidate] });

    const { result } = renderHook(() =>
      useSelectProceduresPanel({
        transferDate: "2026-03-10",
        selectedProcedureIds: [],
        onSelectionChange: ON_CHANGE,
      }),
    );

    await waitFor(() => expect(result.current.filteredCandidates).toHaveLength(1));
    expect(mockGetEligible).toHaveBeenCalledWith("2026-03-10");
    expect(result.current.loading).toBe(false);
  });

  it("clears candidates when transferDate is empty and does not call gateway", async () => {
    const { result } = renderHook(() =>
      useSelectProceduresPanel({
        transferDate: "",
        selectedProcedureIds: [],
        onSelectionChange: ON_CHANGE,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.filteredCandidates).toHaveLength(0);
    expect(mockGetEligible).not.toHaveBeenCalled();
  });

  it("keeps candidates empty when gateway fetch fails", async () => {
    mockGetEligible.mockResolvedValue({ success: false, error: { code: "DatabaseError" } });

    const { result } = renderHook(() =>
      useSelectProceduresPanel({
        transferDate: "2026-03-10",
        selectedProcedureIds: [],
        onSelectionChange: ON_CHANGE,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.filteredCandidates).toHaveLength(0);
  });

  it("toggleProcedure adds a procedure and calls onSelectionChange with ids and total", async () => {
    const candidate = makeCandidate({ procedure_id: "proc-1", billed_amount: 50000 });
    mockGetEligible.mockResolvedValue({ success: true, data: [candidate] });

    const onSelectionChange = vi.fn();
    const { result } = renderHook(() =>
      useSelectProceduresPanel({
        transferDate: "2026-03-10",
        selectedProcedureIds: [],
        onSelectionChange,
      }),
    );

    await waitFor(() => expect(result.current.filteredCandidates).toHaveLength(1));
    act(() => result.current.toggleProcedure(candidate));

    expect(onSelectionChange).toHaveBeenCalledWith(["proc-1"], 50000);
  });

  it("toggleProcedure removes a procedure already in selectedProcedureIds", async () => {
    const candidate = makeCandidate({ procedure_id: "proc-1", billed_amount: 50000 });
    mockGetEligible.mockResolvedValue({ success: true, data: [candidate] });

    const onSelectionChange = vi.fn();
    const SELECTED = ["proc-1"];
    const { result } = renderHook(() =>
      useSelectProceduresPanel({
        transferDate: "2026-03-10",
        selectedProcedureIds: SELECTED,
        onSelectionChange,
      }),
    );

    await waitFor(() => expect(result.current.filteredCandidates).toHaveLength(1));
    act(() => result.current.toggleProcedure(candidate));

    expect(onSelectionChange).toHaveBeenCalledWith([], 0);
  });

  it("handleExpand triggers getAllEligibleProceduresForDirectPayment on next fetch", async () => {
    mockGetEligible.mockResolvedValue({ success: true, data: [] });
    const expanded = makeCandidate({ procedure_id: "proc-all", procedure_date: "2026-01-01" });
    mockGetAllEligible.mockResolvedValue({ success: true, data: [expanded] });

    const { result } = renderHook(() =>
      useSelectProceduresPanel({
        transferDate: "2026-03-10",
        selectedProcedureIds: [],
        onSelectionChange: ON_CHANGE,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.handleExpand());

    await waitFor(() => expect(mockGetAllEligible).toHaveBeenCalled());
    expect(result.current.isExpanded).toBe(true);
    await waitFor(() => expect(result.current.filteredCandidates).toHaveLength(1));
  });

  it("filteredCandidates in expanded mode filters by patient name", async () => {
    useCacheStore.setState({
      patients: [
        makePatient({ id: "pat-1" }), // name: "Marie Dupont"
        { ...makePatient(), id: "pat-2", name: "Jean Martin" },
      ],
    });
    const candidateMarie = makeCandidate({
      procedure_id: "proc-1",
      patient_id: "pat-1",
      procedure_date: "2026-03-11",
    });
    const candidateJean = makeCandidate({
      procedure_id: "proc-2",
      patient_id: "pat-2",
      procedure_date: "2026-03-10",
    });
    mockGetEligible.mockResolvedValue({ success: true, data: [] });
    mockGetAllEligible.mockResolvedValue({ success: true, data: [candidateMarie, candidateJean] });

    const { result } = renderHook(() =>
      useSelectProceduresPanel({
        transferDate: "2026-03-10",
        selectedProcedureIds: [],
        onSelectionChange: ON_CHANGE,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.handleExpand());
    await waitFor(() => expect(result.current.filteredCandidates).toHaveLength(2));

    act(() => result.current.setSearchQuery("jean"));

    expect(result.current.filteredCandidates).toHaveLength(1);
    expect(result.current.filteredCandidates[0]?.procedure_id).toBe("proc-2");
  });
});
