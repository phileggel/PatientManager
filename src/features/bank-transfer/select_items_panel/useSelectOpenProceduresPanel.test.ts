import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FundWireProcedureCandidate } from "@/bindings";
import { PROCEDURE_WINDOW_STORAGE_KEY } from "@/infra/settings/store";
import { useSelectOpenProceduresPanel } from "./useSelectOpenProceduresPanel";

vi.mock("../gateway", () => ({
  getOpenProceduresOfFund: vi.fn(),
}));

import * as gateway from "../gateway";

const mockGetOpen = vi.mocked(gateway.getOpenProceduresOfFund);

const candidate = (id: string, date: string, amount = 46000): FundWireProcedureCandidate => ({
  procedure_id: id,
  patient_name: "Bernard Lucie",
  procedure_date: date,
  billed_amount: amount,
});

// Stable references (F19).
const ON_CHANGE = vi.fn();
const NOW = new Date("2026-11-21T12:00:00.000Z");
const NONE: string[] = [];

describe("useSelectOpenProceduresPanel (#712, BSM-050)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem(PROCEDURE_WINDOW_STORAGE_KEY, "30");
  });

  it("asks nothing while no fund is chosen", () => {
    const { result } = renderHook(() =>
      useSelectOpenProceduresPanel({
        fundId: "",
        selectedProcedureIds: NONE,
        onSelectionChange: ON_CHANGE,
        now: NOW,
      }),
    );

    expect(mockGetOpen).not.toHaveBeenCalled();
    expect(result.current.visible).toEqual([]);
    expect(result.current.hasCandidates).toBe(false);
  });

  it("lists the fund's open procedures in the backend's order, older ones behind the display window", async () => {
    mockGetOpen.mockResolvedValue({
      success: true,
      data: [candidate("p-old", "2026-08-01"), candidate("p-recent", "2026-11-10")],
    });
    const { result } = renderHook(() =>
      useSelectOpenProceduresPanel({
        fundId: "fund-1",
        selectedProcedureIds: NONE,
        onSelectionChange: ON_CHANGE,
        now: NOW,
      }),
    );

    await waitFor(() => expect(result.current.hasCandidates).toBe(true));
    expect(mockGetOpen).toHaveBeenCalledWith("fund-1");
    expect(result.current.visible.map((c) => c.procedure_id)).toEqual(["p-recent"]);
    expect(result.current.hasOlder).toBe(true);
    expect(result.current.windowDays).toBe(30);

    act(() => result.current.showOlderProcedures());

    expect(result.current.visible.map((c) => c.procedure_id)).toEqual(["p-old", "p-recent"]);
    expect(result.current.hasOlder).toBe(false);
  });

  it("reports the ticked procedures with the sum of their billed amounts", async () => {
    mockGetOpen.mockResolvedValue({
      success: true,
      data: [candidate("p-1", "2026-11-10", 46000), candidate("p-2", "2026-11-12", 62500)],
    });
    const selected = ["p-1"];
    const { result } = renderHook(() =>
      useSelectOpenProceduresPanel({
        fundId: "fund-1",
        selectedProcedureIds: selected,
        onSelectionChange: ON_CHANGE,
        now: NOW,
      }),
    );
    await waitFor(() => expect(result.current.hasCandidates).toBe(true));

    act(() => result.current.toggleProcedure("p-2"));
    expect(ON_CHANGE).toHaveBeenLastCalledWith(["p-1", "p-2"], 108500);

    act(() => result.current.toggleProcedure("p-1"));
    expect(ON_CHANGE).toHaveBeenLastCalledWith([], 0);
  });

  it("reads another fund's procedures when the fund changes, the window closed again", async () => {
    mockGetOpen.mockResolvedValue({ success: true, data: [candidate("p-old", "2026-08-01")] });
    let fundId = "fund-1";
    const { result, rerender } = renderHook(() =>
      useSelectOpenProceduresPanel({
        fundId,
        selectedProcedureIds: NONE,
        onSelectionChange: ON_CHANGE,
        now: NOW,
      }),
    );
    await waitFor(() => expect(result.current.hasCandidates).toBe(true));
    act(() => result.current.showOlderProcedures());

    fundId = "fund-2";
    rerender();

    await waitFor(() => expect(mockGetOpen).toHaveBeenLastCalledWith("fund-2"));
    await waitFor(() => expect(result.current.hasOlder).toBe(true));
  });

  it("shows nothing when the read fails", async () => {
    mockGetOpen.mockResolvedValue({ success: false, error: { code: "DatabaseError" } });
    const { result } = renderHook(() =>
      useSelectOpenProceduresPanel({
        fundId: "fund-1",
        selectedProcedureIds: NONE,
        onSelectionChange: ON_CHANGE,
        now: NOW,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.visible).toEqual([]);
  });
});
