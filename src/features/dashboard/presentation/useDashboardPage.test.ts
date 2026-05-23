import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCacheStore } from "@/infra/cache/store";
import { makeProcedure } from "@/tests/procedure.factory";
import { toastService } from "@/ui/components/snackbar";
import { useDashboardPage } from "./useDashboardPage";

vi.mock("../api/dashboardService", () => ({
  fetchDashboardData: vi.fn(),
}));

vi.mock("../utils/aggregation", () => ({
  getAvailableYears: vi.fn(),
  aggregateDashboardMetrics: vi.fn(),
}));

import { fetchDashboardData } from "../api/dashboardService";
import { aggregateDashboardMetrics, getAvailableYears } from "../utils/aggregation";

const mockFetch = vi.mocked(fetchDashboardData);
const mockGetYears = vi.mocked(getAvailableYears);
const mockAggregate = vi.mocked(aggregateDashboardMetrics);

const MOCK_METRICS = {
  totalBilledAmount: 50000,
  procedureCount: 1,
  byProcedureType: [],
} as unknown as ReturnType<typeof aggregateDashboardMetrics>;

const PROC = makeProcedure({ id: "p1", procedure_date: "2026-03-01" });

describe("useDashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ procedureTypes: [] });
    mockGetYears.mockReturnValue([2026]);
    mockAggregate.mockReturnValue(MOCK_METRICS);
  });

  it("loads procedures on mount and sets selectedYear to the most recent year", async () => {
    mockFetch.mockResolvedValue({ success: true, data: { procedures: [PROC] } });

    const { result } = renderHook(() => useDashboardPage());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.allProcedures).toHaveLength(1);
    expect(result.current.selectedYear).toBe(2026);
    expect(result.current.error).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("sets error string when fetchDashboardData fails", async () => {
    mockFetch.mockResolvedValue({ success: false, error: "DB error" });

    const { result } = renderHook(() => useDashboardPage());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeTruthy();
    expect(result.current.allProcedures).toHaveLength(0);
    expect(result.current.selectedYear).toBeNull();
  });

  it("recalculates metrics when setSelectedYear is called", async () => {
    mockFetch.mockResolvedValue({ success: true, data: { procedures: [PROC] } });
    mockGetYears.mockReturnValue([2026, 2025]);

    const { result } = renderHook(() => useDashboardPage());

    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.clearAllMocks();
    mockAggregate.mockReturnValue(MOCK_METRICS);

    act(() => result.current.setSelectedYear(2025));

    await waitFor(() =>
      expect(mockAggregate).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Array),
        2025,
        expect.any(String),
      ),
    );
  });

  it("reloads procedures when procedure_updated window event fires", async () => {
    const PROC_NEW = makeProcedure({ id: "p2" });
    mockFetch.mockResolvedValue({ success: true, data: { procedures: [PROC] } });

    const { result } = renderHook(() => useDashboardPage());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFetch).toHaveBeenCalledTimes(1);

    mockFetch.mockResolvedValue({ success: true, data: { procedures: [PROC, PROC_NEW] } });
    act(() => window.dispatchEvent(new Event("procedure_updated")));

    await waitFor(() => expect(result.current.allProcedures).toHaveLength(2));
  });

  it("shows error toast when procedure_updated reload fails", async () => {
    mockFetch.mockResolvedValue({ success: true, data: { procedures: [] } });
    mockGetYears.mockReturnValue([]);

    const { result } = renderHook(() => useDashboardPage());
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockFetch.mockResolvedValue({ success: false, error: "reload failed" });
    act(() => window.dispatchEvent(new Event("procedure_updated")));

    await waitFor(() =>
      expect(vi.mocked(toastService.show)).toHaveBeenCalledWith("error", expect.any(String)),
    );
  });
});
