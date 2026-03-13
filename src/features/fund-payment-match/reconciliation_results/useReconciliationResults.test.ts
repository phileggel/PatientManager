/**
 * Tests for useReconciliationResults hook.
 * Covers navigation state transitions (goNext, goPrev, goTo) and boundary conditions.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReconciliationMatch, ReconciliationResult } from "@/bindings";
import { useReconciliationResults } from "./useReconciliationResults";

const makePdfLine = (index: number) => ({
  line_index: index,
  payment_date: "2025-05-01",
  invoice_number: `${index}`,
  fund_name: "CPAM",
  patient_name: "Test",
  ssn: "1234567890123",
  nature: "SF",
  procedure_start_date: "2025-05-01",
  procedure_end_date: "2025-05-01",
  is_period: false,
  amount: 10000,
});

const makeDbMatch = (id: string) => ({
  procedure_id: id,
  procedure_date: "2025-05-01",
  fund_id: "fund-1",
  amount: 10000,
  anomalies: [] as string[],
});

const makeResult = (types: string[]): ReconciliationResult => ({
  matches: types.map((type, i) => {
    if (type === "NotFoundIssue")
      return {
        type,
        data: { pdf_line: makePdfLine(i), nearby_candidates: [] },
      } as ReconciliationMatch;
    if (type === "GroupMatchIssue")
      return {
        type,
        data: { pdf_line: makePdfLine(i), db_matches: [makeDbMatch(`p${i}`)] },
      } as ReconciliationMatch;
    if (type === "TooManyMatchIssue")
      return {
        type,
        data: { pdf_line: makePdfLine(i), candidate_ids: ["a"] },
      } as ReconciliationMatch;
    if (type === "PerfectSingleMatch")
      return {
        type,
        data: { pdf_line: makePdfLine(i), db_match: makeDbMatch(`p${i}`) },
      } as ReconciliationMatch;
    return {
      type: "SingleMatchIssue",
      data: { pdf_line: makePdfLine(i), db_match: makeDbMatch(`p${i}`) },
    } as ReconciliationMatch;
  }),
});

const emptyKeys = new Set<string>();
const emptyCorrections = new Map();

describe("useReconciliationResults — navigation", () => {
  it("starts at index 0", () => {
    const { result } = renderHook(() =>
      useReconciliationResults(
        makeResult(["NotFoundIssue", "SingleMatchIssue"]),
        emptyKeys,
        emptyCorrections,
      ),
    );
    expect(result.current.currentIndex).toBe(0);
  });

  it("goNext increments index", () => {
    const { result } = renderHook(() =>
      useReconciliationResults(
        makeResult(["NotFoundIssue", "SingleMatchIssue"]),
        emptyKeys,
        emptyCorrections,
      ),
    );
    act(() => result.current.goNext());
    expect(result.current.currentIndex).toBe(1);
  });

  it("goNext does not exceed last index", () => {
    const { result } = renderHook(() =>
      useReconciliationResults(
        makeResult(["NotFoundIssue", "SingleMatchIssue"]),
        emptyKeys,
        emptyCorrections,
      ),
    );
    act(() => result.current.goNext());
    act(() => result.current.goNext());
    expect(result.current.currentIndex).toBe(1);
  });

  it("goPrev decrements index", () => {
    const { result } = renderHook(() =>
      useReconciliationResults(
        makeResult(["NotFoundIssue", "SingleMatchIssue"]),
        emptyKeys,
        emptyCorrections,
      ),
    );
    act(() => result.current.goNext());
    act(() => result.current.goPrev());
    expect(result.current.currentIndex).toBe(0);
  });

  it("goPrev does not go below 0", () => {
    const { result } = renderHook(() =>
      useReconciliationResults(
        makeResult(["NotFoundIssue", "SingleMatchIssue"]),
        emptyKeys,
        emptyCorrections,
      ),
    );
    act(() => result.current.goPrev());
    expect(result.current.currentIndex).toBe(0);
  });

  it("goTo jumps to arbitrary index", () => {
    const { result } = renderHook(() =>
      useReconciliationResults(
        makeResult(["TooManyMatchIssue", "GroupMatchIssue", "NotFoundIssue"]),
        emptyKeys,
        emptyCorrections,
      ),
    );
    act(() => result.current.goTo(2));
    expect(result.current.currentIndex).toBe(2);
  });

  it("goTo clamps to valid range", () => {
    const { result } = renderHook(() =>
      useReconciliationResults(
        makeResult(["NotFoundIssue", "SingleMatchIssue"]),
        emptyKeys,
        emptyCorrections,
      ),
    );
    act(() => result.current.goTo(99));
    expect(result.current.currentIndex).toBe(1);

    act(() => result.current.goTo(-5));
    expect(result.current.currentIndex).toBe(0);
  });

  it("currentIssue matches the sorted issue at currentIndex", () => {
    const { result } = renderHook(() =>
      useReconciliationResults(
        // TooManyMatchIssue is always first regardless of line_index
        makeResult(["SingleMatchIssue", "TooManyMatchIssue"]),
        emptyKeys,
        emptyCorrections,
      ),
    );
    expect(result.current.currentIssue?.type).toBe("TooManyMatchIssue"); // blocking: always first
  });

  it("excludes perfect matches from sorted issues", () => {
    const { result } = renderHook(() =>
      useReconciliationResults(
        makeResult(["PerfectSingleMatch", "NotFoundIssue"]),
        emptyKeys,
        emptyCorrections,
      ),
    );
    expect(result.current.sortedIssues).toHaveLength(1);
    expect(result.current.sortedIssues[0]?.type).toBe("NotFoundIssue");
  });
});

describe("useReconciliationResults — blockingCount", () => {
  it("counts TooManyMatchIssue as blocking", () => {
    const { result } = renderHook(() =>
      useReconciliationResults(
        makeResult(["TooManyMatchIssue", "TooManyMatchIssue", "NotFoundIssue"]),
        emptyKeys,
        emptyCorrections,
      ),
    );
    expect(result.current.blockingCount).toBe(2);
  });

  it("returns 0 blocking when no TooManyMatchIssue", () => {
    const { result } = renderHook(() =>
      useReconciliationResults(
        makeResult(["NotFoundIssue", "SingleMatchIssue"]),
        emptyKeys,
        emptyCorrections,
      ),
    );
    expect(result.current.blockingCount).toBe(0);
  });
});

describe("useReconciliationResults — auto-advance", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("auto-advances to next unresolved issue after 500ms when current becomes resolved", () => {
    // Two NotFoundIssues: resolving index 0 (key "CreateProcedure-0") leaves index 1 unresolved
    const { result, rerender } = renderHook(
      ({ keys }: { keys: Set<string> }) =>
        useReconciliationResults(
          makeResult(["NotFoundIssue", "NotFoundIssue"]),
          keys,
          emptyCorrections,
        ),
      { initialProps: { keys: emptyKeys } },
    );
    expect(result.current.currentIndex).toBe(0);

    act(() => {
      rerender({ keys: new Set(["CreateProcedure-0"]) });
    });
    // Timer not yet elapsed
    expect(result.current.currentIndex).toBe(0);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.currentIndex).toBe(1);
  });

  it("does not advance when all issues are resolved", () => {
    const resolvedKeys = new Set(["CreateProcedure-0"]);
    const { result, rerender } = renderHook(
      ({ keys }: { keys: Set<string> }) =>
        useReconciliationResults(makeResult(["NotFoundIssue"]), keys, emptyCorrections),
      { initialProps: { keys: emptyKeys } },
    );

    act(() => {
      rerender({ keys: resolvedKeys });
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    // Only one issue, stays at 0
    expect(result.current.currentIndex).toBe(0);
  });
});

describe("useReconciliationResults — onReportUnresolvedGroupCount", () => {
  it("reports 0 when no unresolved GroupMatchIssue", () => {
    const onReport = vi.fn();
    renderHook(() =>
      useReconciliationResults(
        makeResult(["NotFoundIssue", "SingleMatchIssue"]),
        emptyKeys,
        emptyCorrections,
        undefined,
        onReport,
      ),
    );
    expect(onReport).toHaveBeenCalledWith(0);
  });
});

describe("useReconciliationResults — onReportResolvedCount", () => {
  it("reports resolved count when acceptedKeys change", () => {
    const onReport = vi.fn();
    const result_data = makeResult(["NotFoundIssue"]);
    const { rerender } = renderHook(
      ({ keys }: { keys: Set<string> }) =>
        useReconciliationResults(result_data, keys, emptyCorrections, onReport),
      { initialProps: { keys: emptyKeys } },
    );

    expect(onReport).toHaveBeenLastCalledWith(0);

    const accepted = new Set(["CreateProcedure-0"]);
    rerender({ keys: accepted });

    expect(onReport).toHaveBeenLastCalledWith(1);
  });
});
