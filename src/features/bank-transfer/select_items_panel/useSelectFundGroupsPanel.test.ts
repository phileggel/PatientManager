import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FundGroupCandidate } from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";
import { useSelectFundGroupsPanel } from "./useSelectFundGroupsPanel";

vi.mock("../gateway", () => ({
  getUnsettledFundGroups: vi.fn(),
  getAllUnsettledFundGroups: vi.fn(),
  readAllBankTransfers: vi.fn(),
  deleteTransferByType: vi.fn(),
  createBankTransfer: vi.fn(),
  updateBankTransfer: vi.fn(),
  getCashBankAccountId: vi.fn(),
  getFundGroupsByIds: vi.fn(),
  createFundTransfer: vi.fn(),
  updateFundTransfer: vi.fn(),
  getTransferFundGroupIds: vi.fn(),
  getEligibleProceduresForDirectPayment: vi.fn(),
  getAllEligibleProceduresForDirectPayment: vi.fn(),
  getProceduresByIds: vi.fn(),
  createDirectTransfer: vi.fn(),
  updateDirectTransfer: vi.fn(),
  getTransferProcedureIds: vi.fn(),
}));

import * as gateway from "../gateway";

const mockGetUnsettled = vi.mocked(gateway.getUnsettledFundGroups);
const mockGetAll = vi.mocked(gateway.getAllUnsettledFundGroups);

const makeGroup = (overrides?: Partial<FundGroupCandidate>): FundGroupCandidate => ({
  group_id: "g1",
  fund_id: "f1",
  payment_date: "2026-03-10",
  total_amount: 150000,
  ...overrides,
});

// Stable callback reference to avoid stale-closure issues in hook tests
const ON_CHANGE = vi.fn();

describe("useSelectFundGroupsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({
      funds: [
        { id: "f1", fund_identifier: "CPAM", name: "CPAM France", temp_id: null },
        { id: "f2", fund_identifier: "MGEN", name: "MGEN Santé", temp_id: null },
      ],
    });
  });

  it("fetches unsettled fund groups when transferDate is set", async () => {
    const group = makeGroup();
    mockGetUnsettled.mockResolvedValue({ success: true, data: [group] });

    const { result } = renderHook(() =>
      useSelectFundGroupsPanel({
        transferDate: "2026-03-10",
        selectedGroupIds: [],
        onSelectionChange: ON_CHANGE,
      }),
    );

    await waitFor(() => expect(result.current.filteredCandidates).toHaveLength(1));
    expect(mockGetUnsettled).toHaveBeenCalledWith("2026-03-10");
    expect(result.current.loading).toBe(false);
  });

  it("clears candidates when transferDate is empty and does not call gateway", async () => {
    const { result } = renderHook(() =>
      useSelectFundGroupsPanel({
        transferDate: "",
        selectedGroupIds: [],
        onSelectionChange: ON_CHANGE,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.filteredCandidates).toHaveLength(0);
    expect(mockGetUnsettled).not.toHaveBeenCalled();
  });

  it("keeps candidates empty when gateway fetch fails", async () => {
    mockGetUnsettled.mockResolvedValue({ success: false, error: "fetch failed" });

    const { result } = renderHook(() =>
      useSelectFundGroupsPanel({
        transferDate: "2026-03-10",
        selectedGroupIds: [],
        onSelectionChange: ON_CHANGE,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.filteredCandidates).toHaveLength(0);
  });

  it("toggleGroup adds a group and calls onSelectionChange with ids and total", async () => {
    const group = makeGroup({ group_id: "g1", total_amount: 150000 });
    mockGetUnsettled.mockResolvedValue({ success: true, data: [group] });

    const onSelectionChange = vi.fn();
    const { result } = renderHook(() =>
      useSelectFundGroupsPanel({
        transferDate: "2026-03-10",
        selectedGroupIds: [],
        onSelectionChange,
      }),
    );

    await waitFor(() => expect(result.current.filteredCandidates).toHaveLength(1));
    act(() => result.current.toggleGroup(group));

    expect(onSelectionChange).toHaveBeenCalledWith(["g1"], 150000);
  });

  it("toggleGroup removes a group already in selectedGroupIds", async () => {
    const group = makeGroup({ group_id: "g1", total_amount: 150000 });
    mockGetUnsettled.mockResolvedValue({ success: true, data: [group] });

    const onSelectionChange = vi.fn();
    const SELECTED = ["g1"];
    const { result } = renderHook(() =>
      useSelectFundGroupsPanel({
        transferDate: "2026-03-10",
        selectedGroupIds: SELECTED,
        onSelectionChange,
      }),
    );

    await waitFor(() => expect(result.current.filteredCandidates).toHaveLength(1));
    act(() => result.current.toggleGroup(group));

    expect(onSelectionChange).toHaveBeenCalledWith([], 0);
  });

  it("handleExpand triggers getAllUnsettledFundGroups on next fetch", async () => {
    mockGetUnsettled.mockResolvedValue({ success: true, data: [] });
    const expandedGroup = makeGroup({ group_id: "g-all" });
    mockGetAll.mockResolvedValue({ success: true, data: [expandedGroup] });

    const { result } = renderHook(() =>
      useSelectFundGroupsPanel({
        transferDate: "2026-03-10",
        selectedGroupIds: [],
        onSelectionChange: ON_CHANGE,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.handleExpand());

    await waitFor(() => expect(mockGetAll).toHaveBeenCalled());
    expect(result.current.isExpanded).toBe(true);
    await waitFor(() => expect(result.current.filteredCandidates).toHaveLength(1));
    expect(result.current.filteredCandidates[0]?.group_id).toBe("g-all");
  });

  it("filteredCandidates in expanded mode filters by fundFilter on fund name", async () => {
    const groupCpam = makeGroup({ group_id: "g1", fund_id: "f1", payment_date: "2026-03-11" });
    const groupMgen = makeGroup({ group_id: "g2", fund_id: "f2", payment_date: "2026-03-10" });
    mockGetUnsettled.mockResolvedValue({ success: true, data: [] });
    mockGetAll.mockResolvedValue({ success: true, data: [groupCpam, groupMgen] });

    const { result } = renderHook(() =>
      useSelectFundGroupsPanel({
        transferDate: "2026-03-10",
        selectedGroupIds: [],
        onSelectionChange: ON_CHANGE,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.handleExpand());
    await waitFor(() => expect(result.current.filteredCandidates).toHaveLength(2));

    act(() => result.current.setFundFilter("cpam"));

    expect(result.current.filteredCandidates).toHaveLength(1);
    expect(result.current.filteredCandidates[0]?.group_id).toBe("g1");
  });
});
