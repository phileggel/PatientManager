import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useCacheStore } from "@/infra/cache/store";
import { makeFund } from "@/tests/fund.factory";
import { useSelectFundModal } from "./useSelectFundModal";

const funds = [
  makeFund({ id: "f-1", fund_identifier: "440", name: "CPAM Loire" }),
  makeFund({ id: "f-2", fund_identifier: "750", name: "MGEN Paris" }),
  makeFund({ id: "f-3", fund_identifier: "310", name: "MSA Gironde" }),
];

describe("useSelectFundModal", () => {
  beforeEach(() => {
    useCacheStore.setState({ funds });
  });

  it("returns all funds when search term is empty", () => {
    const { result } = renderHook(() => useSelectFundModal());

    expect(result.current.filteredFunds).toHaveLength(3);
  });

  it("filters funds by name (case-insensitive)", () => {
    const { result } = renderHook(() => useSelectFundModal());

    act(() => result.current.setSearchTerm("cpam"));

    expect(result.current.filteredFunds).toHaveLength(1);
    expect(result.current.filteredFunds[0]?.id).toBe("f-1");
  });

  it("filters funds by fund_identifier", () => {
    const { result } = renderHook(() => useSelectFundModal());

    act(() => result.current.setSearchTerm("750"));

    expect(result.current.filteredFunds).toHaveLength(1);
    expect(result.current.filteredFunds[0]?.id).toBe("f-2");
  });

  it("returns empty array when no fund matches the search term", () => {
    const { result } = renderHook(() => useSelectFundModal());

    act(() => result.current.setSearchTerm("zzz"));

    expect(result.current.filteredFunds).toHaveLength(0);
  });

  it("whitespace-only search term returns all funds", () => {
    const { result } = renderHook(() => useSelectFundModal());

    act(() => result.current.setSearchTerm("   "));

    expect(result.current.filteredFunds).toHaveLength(3);
  });
});
