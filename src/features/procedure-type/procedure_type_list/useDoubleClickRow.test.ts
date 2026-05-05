import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDoubleClickRow } from "./useDoubleClickRow";

describe("useDoubleClickRow", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not call onDoubleClick on the first click", () => {
    const cb = vi.fn();
    const { result } = renderHook(() => useDoubleClickRow(cb));

    vi.mocked(Date.now).mockReturnValue(1000);
    act(() => result.current.handleRowClick("row-1"));

    expect(cb).not.toHaveBeenCalled();
  });

  it("calls onDoubleClick when same row clicked twice within 300ms", () => {
    const cb = vi.fn();
    const { result } = renderHook(() => useDoubleClickRow(cb));

    vi.mocked(Date.now).mockReturnValueOnce(1000);
    act(() => result.current.handleRowClick("row-1"));
    vi.mocked(Date.now).mockReturnValueOnce(1200);
    act(() => result.current.handleRowClick("row-1"));

    expect(cb).toHaveBeenCalledWith("row-1");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("does not call onDoubleClick when different row is clicked", () => {
    const cb = vi.fn();
    const { result } = renderHook(() => useDoubleClickRow(cb));

    vi.mocked(Date.now).mockReturnValueOnce(1000);
    act(() => result.current.handleRowClick("row-1"));
    vi.mocked(Date.now).mockReturnValueOnce(1100);
    act(() => result.current.handleRowClick("row-2"));

    expect(cb).not.toHaveBeenCalled();
  });

  it("does not call onDoubleClick when same row clicked but time exceeds 300ms threshold", () => {
    const cb = vi.fn();
    const { result } = renderHook(() => useDoubleClickRow(cb));

    vi.mocked(Date.now).mockReturnValueOnce(1000);
    act(() => result.current.handleRowClick("row-1"));
    vi.mocked(Date.now).mockReturnValueOnce(1400);
    act(() => result.current.handleRowClick("row-1"));

    expect(cb).not.toHaveBeenCalled();
  });

  it("does nothing when id is undefined", () => {
    const cb = vi.fn();
    const { result } = renderHook(() => useDoubleClickRow(cb));

    act(() => result.current.handleRowClick(undefined));

    expect(cb).not.toHaveBeenCalled();
  });
});
