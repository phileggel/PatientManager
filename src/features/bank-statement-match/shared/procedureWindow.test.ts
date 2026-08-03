/**
 * Unit tests for procedureWindow.ts (BAS-118/118A) — pure display-window filter
 * over the (not date-bounded) open-procedure candidate pool the backend
 * returns (BAS-112). The window is a frontend display preference only; no
 * wire change (contract 2026-08-03 changelog).
 *
 * `filterProceduresByWindow` is injected with `now` so tests never depend on
 * the real clock (F19 stable references / determinism).
 *
 * These tests fail until shared/procedureWindow.ts is created.
 */
import { describe, expect, it } from "vitest";
import type { BankStatementProcedureCandidate } from "@/bindings";
import { filterProceduresByWindow } from "./procedureWindow";

const NOW = new Date("2026-05-01T00:00:00.000Z");

function makeCandidate(
  overrides: Partial<BankStatementProcedureCandidate> = {},
): BankStatementProcedureCandidate {
  return {
    procedure_id: "proc-1",
    patient_name: "Jean Dupont",
    procedure_date: "2026-04-01",
    billed_amount: 50000,
    is_exact_amount: false,
    ...overrides,
  };
}

describe("filterProceduresByWindow — BAS-118", () => {
  it("keeps a procedure dated within the window (recent)", () => {
    const candidate = makeCandidate({ procedure_id: "proc-recent", procedure_date: "2026-04-20" });
    const result = filterProceduresByWindow([candidate], 90, NOW, []);
    expect(result.map((c) => c.procedure_id)).toEqual(["proc-recent"]);
  });

  it("excludes a procedure dated before the window (90 days before 2026-05-01)", () => {
    // 2026-05-01 minus 90 days = 2026-01-31; 2026-01-15 is outside the window.
    const candidate = makeCandidate({ procedure_id: "proc-old", procedure_date: "2026-01-15" });
    const result = filterProceduresByWindow([candidate], 90, NOW, []);
    expect(result).toEqual([]);
  });

  it("keeps a procedure dated exactly at the window boundary (inclusive)", () => {
    // 2026-05-01 minus 90 days = 2026-01-31.
    const candidate = makeCandidate({
      procedure_id: "proc-boundary",
      procedure_date: "2026-01-31",
    });
    const result = filterProceduresByWindow([candidate], 90, NOW, []);
    expect(result.map((c) => c.procedure_id)).toEqual(["proc-boundary"]);
  });

  it("respects a custom window size (7 days)", () => {
    const withinSeven = makeCandidate({
      procedure_id: "proc-within-7",
      procedure_date: "2026-04-26",
    });
    const beyondSeven = makeCandidate({
      procedure_id: "proc-beyond-7",
      procedure_date: "2026-04-20",
    });
    const result = filterProceduresByWindow([withinSeven, beyondSeven], 7, NOW, []);
    expect(result.map((c) => c.procedure_id)).toEqual(["proc-within-7"]);
  });

  it("always keeps a procedure already assigned to the line, regardless of its date (BAS-118 mirror of BAS-068)", () => {
    const assignedButOld = makeCandidate({
      procedure_id: "proc-assigned-old",
      procedure_date: "2025-01-01",
    });
    const result = filterProceduresByWindow([assignedButOld], 90, NOW, ["proc-assigned-old"]);
    expect(result.map((c) => c.procedure_id)).toEqual(["proc-assigned-old"]);
  });

  it("preserves wire order among the candidates that pass the filter", () => {
    const a = makeCandidate({ procedure_id: "proc-a", procedure_date: "2026-04-10" });
    const b = makeCandidate({ procedure_id: "proc-b", procedure_date: "2026-04-20" });
    const result = filterProceduresByWindow([a, b], 90, NOW, []);
    expect(result.map((c) => c.procedure_id)).toEqual(["proc-a", "proc-b"]);
  });
});
