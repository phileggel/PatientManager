import { describe, expect, test } from "vitest";
import { makeProcedureRow } from "@/tests/procedure.factory";
import { computeHighWaterMark, markOverdueRows } from "./overdue.logic";
import type { ProcedureRow } from "./procedure-row.types";

const row = (status: string, procedureDate: string | null, rowId: string): ProcedureRow =>
  makeProcedureRow({ rowId, status, procedureDate });

describe("computeHighWaterMark (PRO-310)", () => {
  test("returns the most recent date among fund-reconciled procedures", () => {
    const rows = [
      row("RECONCILED", "2025-03-10", "a"),
      row("FUND_PAID", "2025-06-01", "b"),
      row("PARTIALLY_FUND_PAID", "2025-04-20", "c"),
      row("CREATED", "2025-12-31", "d"), // CREATED never contributes
    ];
    expect(computeHighWaterMark(rows)).toBe("2025-06-01");
  });

  test("counts only fund-reconciled statuses — direct/overpaid/refund excluded", () => {
    const rows = [
      row("DIRECTLY_PAID", "2025-09-09", "a"),
      row("IMPORT_DIRECTLY_PAID", "2025-09-08", "b"),
      row("OVERPAID", "2025-09-07", "c"),
      row("OVERPAYMENT_REFUND", "2025-09-06", "d"),
      row("IMPORT_FUND_PAID", "2025-02-02", "e"), // the only contributor
    ];
    expect(computeHighWaterMark(rows)).toBe("2025-02-02");
  });

  test("returns null when no fund-reconciled procedure exists", () => {
    expect(computeHighWaterMark([row("CREATED", "2025-01-01", "a")])).toBeNull();
    expect(computeHighWaterMark([])).toBeNull();
  });

  test("ignores fund-reconciled rows without a date", () => {
    const rows = [row("RECONCILED", null, "a"), row("FUND_PAID", "2025-05-05", "b")];
    expect(computeHighWaterMark(rows)).toBe("2025-05-05");
  });
});

describe("markOverdueRows (PRO-310)", () => {
  test("flags a CREATED row strictly older than the high-water mark", () => {
    const rows = markOverdueRows([
      row("FUND_PAID", "2025-06-01", "hwm"),
      row("CREATED", "2025-05-31", "old"),
    ]);
    expect(rows.find((r) => r.rowId === "old")?.isOverdue).toBe(true);
  });

  test("does not flag a CREATED row dated exactly on the mark (strictly earlier)", () => {
    const rows = markOverdueRows([
      row("FUND_PAID", "2025-06-01", "hwm"),
      row("CREATED", "2025-06-01", "equal"),
    ]);
    expect(rows.find((r) => r.rowId === "equal")?.isOverdue).toBe(false);
  });

  test("does not flag a CREATED row newer than the mark", () => {
    const rows = markOverdueRows([
      row("FUND_PAID", "2025-06-01", "hwm"),
      row("CREATED", "2025-06-02", "new"),
    ]);
    expect(rows.find((r) => r.rowId === "new")?.isOverdue).toBe(false);
  });

  test("only CREATED rows are ever overdue — older non-CREATED rows are untouched", () => {
    const rows = markOverdueRows([
      row("FUND_PAID", "2025-06-01", "hwm"),
      row("PARTIALLY_RECONCILED", "2025-01-01", "older-reconciled"),
      row("NONE", "2025-01-02", "older-none"),
    ]);
    expect(rows.every((r) => r.isOverdue === false)).toBe(true);
  });

  test("nothing is overdue when there is no fund-reconciled procedure", () => {
    const rows = markOverdueRows([
      row("CREATED", "2020-01-01", "a"),
      row("CREATED", "2025-01-01", "b"),
    ]);
    expect(rows.every((r) => r.isOverdue === false)).toBe(true);
  });

  test("a CREATED row without a date is never overdue", () => {
    const rows = markOverdueRows([
      row("FUND_PAID", "2025-06-01", "hwm"),
      row("CREATED", null, "no-date"),
    ]);
    expect(rows.find((r) => r.rowId === "no-date")?.isOverdue).toBe(false);
  });
});
