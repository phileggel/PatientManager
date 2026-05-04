import { describe, expect, it } from "vitest";
import { makeProcedureRow } from "@/tests/procedure.factory";
import { summarizeProcedureRows } from "./presenter";

describe("summarizeProcedureRows", () => {
  it("returns all zeros for empty input", () => {
    const vm = summarizeProcedureRows([]);
    expect(vm.uniquePatients).toBe(0);
    expect(vm.procedureCount).toBe(0);
    expect(vm.totalAmountThousandths).toBe(0);
    expect(vm.totalReceivedThousandths).toBe(0);
    expect(vm.totalAwaitedThousandths).toBe(0);
  });

  it("excludes draft rows from all aggregations", () => {
    const rows = [makeProcedureRow({ isDraft: true, patientId: "p-1", effectiveAmount: 100 })];
    const vm = summarizeProcedureRows(rows);
    expect(vm.uniquePatients).toBe(0);
    expect(vm.procedureCount).toBe(0);
    expect(vm.totalAmountThousandths).toBe(0);
  });

  it("counts unique patients (same patient across multiple rows counts once)", () => {
    const rows = [
      makeProcedureRow({ patientId: "p-1" }),
      makeProcedureRow({ patientId: "p-1" }),
      makeProcedureRow({ patientId: "p-2" }),
    ];
    expect(summarizeProcedureRows(rows).uniquePatients).toBe(2);
  });

  it("excludes rows with null patientId from unique-patient count", () => {
    const rows = [makeProcedureRow({ patientId: null }), makeProcedureRow({ patientId: "p-1" })];
    expect(summarizeProcedureRows(rows).uniquePatients).toBe(1);
  });

  it("sums effectiveAmount into totalAmountThousandths (converted to thousandths)", () => {
    const rows = [
      makeProcedureRow({ effectiveAmount: 25 }),
      makeProcedureRow({ effectiveAmount: 75 }),
    ];
    expect(summarizeProcedureRows(rows).totalAmountThousandths).toBe(100_000);
  });

  it("rows with null effectiveAmount contribute 0 to totalAmount", () => {
    const rows = [
      makeProcedureRow({ effectiveAmount: null }),
      makeProcedureRow({ effectiveAmount: 50 }),
    ];
    expect(summarizeProcedureRows(rows).totalAmountThousandths).toBe(50_000);
  });

  it("sums actualPaymentAmount into totalReceived when present", () => {
    const rows = [
      makeProcedureRow({ actualPaymentAmount: 30, status: "RECONCILED" }),
      makeProcedureRow({ actualPaymentAmount: 20, status: "FUND_PAID" }),
    ];
    expect(summarizeProcedureRows(rows).totalReceivedThousandths).toBe(50_000);
  });

  it("falls back to effectiveAmount for paid-status rows with null actualPaymentAmount", () => {
    const rows = [
      makeProcedureRow({ actualPaymentAmount: null, effectiveAmount: 50, status: "RECONCILED" }),
    ];
    expect(summarizeProcedureRows(rows).totalReceivedThousandths).toBe(50_000);
  });

  it("does not count effectiveAmount as received for non-paid status", () => {
    const rows = [
      makeProcedureRow({ actualPaymentAmount: null, effectiveAmount: 50, status: "CREATED" }),
    ];
    expect(summarizeProcedureRows(rows).totalReceivedThousandths).toBe(0);
  });

  it("totalAwaited = billed − received, floored at 0", () => {
    const rows = [
      makeProcedureRow({
        effectiveAmount: 100,
        actualPaymentAmount: 30,
        status: "PARTIALLY_RECONCILED",
      }),
    ];
    expect(summarizeProcedureRows(rows).totalAwaitedThousandths).toBe(70_000);
  });

  it("totalAwaited never goes below zero (overpaid case)", () => {
    const rows = [
      makeProcedureRow({ effectiveAmount: 50, actualPaymentAmount: 80, status: "OVERPAID" }),
    ];
    expect(summarizeProcedureRows(rows).totalAwaitedThousandths).toBe(0);
  });

  it("totalAwaited uses paid-status fallback when actualPaymentAmount is null", () => {
    const rows = [
      makeProcedureRow({ effectiveAmount: 60, actualPaymentAmount: null, status: "FUND_PAID" }),
    ];
    expect(summarizeProcedureRows(rows).totalAwaitedThousandths).toBe(0);
  });

  it("totalAwaited treats null effectiveAmount as 0 (no overpayment implied)", () => {
    const rows = [
      makeProcedureRow({ effectiveAmount: null, actualPaymentAmount: 30, status: "RECONCILED" }),
    ];
    expect(summarizeProcedureRows(rows).totalAwaitedThousandths).toBe(0);
  });

  it("all five aggregates across a mixed-status set", () => {
    const rows = [
      makeProcedureRow({ isDraft: true, patientId: "p-draft", effectiveAmount: 999 }),
      makeProcedureRow({ patientId: null, effectiveAmount: 40, status: "CREATED" }),
      makeProcedureRow({
        patientId: "p-1",
        effectiveAmount: 50,
        actualPaymentAmount: 50,
        status: "RECONCILED",
      }),
      makeProcedureRow({
        patientId: "p-1",
        effectiveAmount: 100,
        actualPaymentAmount: 30,
        status: "PARTIALLY_RECONCILED",
      }),
      makeProcedureRow({
        patientId: "p-2",
        effectiveAmount: 60,
        actualPaymentAmount: null,
        status: "FUND_PAID",
      }),
    ];
    const vm = summarizeProcedureRows(rows);
    expect(vm.uniquePatients).toBe(2); // p-1, p-2 (null excluded, draft excluded)
    expect(vm.procedureCount).toBe(4); // draft excluded
    expect(vm.totalAmountThousandths).toBe(250_000); // 40 + 50 + 100 + 60
    expect(vm.totalReceivedThousandths).toBe(140_000); // 0 + 50 + 30 + 60 (FUND_PAID fallback)
    expect(vm.totalAwaitedThousandths).toBe(110_000); // 40 + 0 + 70 + 0
  });
});
