import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCacheStore } from "@/infra/cache/store";
import { useFundList } from "./useFundList";

vi.mock("../gateway", () => ({
  deleteFund: vi.fn(),
}));

import { deleteFund } from "../gateway";

const mockDelete = vi.mocked(deleteFund);

describe("useFundList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: [], fundsLoading: false });
  });

  it("maps store funds to rows via FundPresenter.toRow", () => {
    useCacheStore.setState({
      funds: [{ id: "f1", fund_identifier: "75", name: "CPAM 75" }],
    });

    const { result } = renderHook(() => useFundList());

    expect(result.current.fundRows).toHaveLength(1);
    expect(result.current.fundRows[0]?.fundName).toBe("CPAM 75");
  });

  it("deleteFund resolves without throwing when gateway returns success=true", async () => {
    mockDelete.mockResolvedValue({ success: true, data: undefined });

    const { result } = renderHook(() => useFundList());

    await expect(result.current.deleteFund("f1")).resolves.toBeUndefined();
  });

  it("deleteFund throws a translated error when gateway returns success=false", async () => {
    mockDelete.mockResolvedValue({ success: false, error: { code: "DatabaseError" } });

    const { result } = renderHook(() => useFundList());

    await act(async () => {
      await expect(result.current.deleteFund("f1")).rejects.toThrow(/database error/i);
    });
  });
});
