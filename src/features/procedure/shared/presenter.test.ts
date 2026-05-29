import { describe, expect, it } from "vitest";
import type { ProcedureOrchestrationError } from "@/bindings";
import { makeProcedureRow } from "@/tests/procedure.factory";
import { formatProcedureOrchestrationError, summarizeProcedureRows } from "./presenter";

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
    const rows = [makeProcedureRow({ isDraft: true, patientId: "p-1", billedAmount: 100 })];
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

  it("sums billedAmount into totalAmountThousandths (converted to thousandths)", () => {
    const rows = [makeProcedureRow({ billedAmount: 25 }), makeProcedureRow({ billedAmount: 75 })];
    expect(summarizeProcedureRows(rows).totalAmountThousandths).toBe(100_000);
  });

  it("rows with null billedAmount contribute 0 to totalAmount", () => {
    const rows = [makeProcedureRow({ billedAmount: 0 }), makeProcedureRow({ billedAmount: 50 })];
    expect(summarizeProcedureRows(rows).totalAmountThousandths).toBe(50_000);
  });

  it("sums paidAmount into totalReceived when present", () => {
    const rows = [
      makeProcedureRow({ paidAmount: 30, status: "RECONCILED" }),
      makeProcedureRow({ paidAmount: 20, status: "FUND_PAID" }),
    ];
    expect(summarizeProcedureRows(rows).totalReceivedThousandths).toBe(50_000);
  });

  it("falls back to billedAmount for paid-status rows with null paidAmount", () => {
    const rows = [makeProcedureRow({ paidAmount: null, billedAmount: 50, status: "RECONCILED" })];
    expect(summarizeProcedureRows(rows).totalReceivedThousandths).toBe(50_000);
  });

  it("does not count billedAmount as received for non-paid status", () => {
    const rows = [makeProcedureRow({ paidAmount: null, billedAmount: 50, status: "CREATED" })];
    expect(summarizeProcedureRows(rows).totalReceivedThousandths).toBe(0);
  });

  it("totalAwaited = billed − received, floored at 0", () => {
    const rows = [
      makeProcedureRow({
        billedAmount: 100,
        paidAmount: 30,
        status: "PARTIALLY_RECONCILED",
      }),
    ];
    expect(summarizeProcedureRows(rows).totalAwaitedThousandths).toBe(70_000);
  });

  it("totalAwaited never goes below zero (overpaid case)", () => {
    const rows = [makeProcedureRow({ billedAmount: 50, paidAmount: 80, status: "OVERPAID" })];
    expect(summarizeProcedureRows(rows).totalAwaitedThousandths).toBe(0);
  });

  it("totalAwaited uses paid-status fallback when paidAmount is null", () => {
    const rows = [makeProcedureRow({ billedAmount: 60, paidAmount: null, status: "FUND_PAID" })];
    expect(summarizeProcedureRows(rows).totalAwaitedThousandths).toBe(0);
  });

  it("totalAwaited treats null billedAmount as 0 (no overpayment implied)", () => {
    const rows = [makeProcedureRow({ billedAmount: 0, paidAmount: 30, status: "RECONCILED" })];
    expect(summarizeProcedureRows(rows).totalAwaitedThousandths).toBe(0);
  });

  it("all five aggregates across a mixed-status set", () => {
    const rows = [
      makeProcedureRow({ isDraft: true, patientId: "p-draft", billedAmount: 999 }),
      makeProcedureRow({ patientId: null, billedAmount: 40, status: "CREATED" }),
      makeProcedureRow({
        patientId: "p-1",
        billedAmount: 50,
        paidAmount: 50,
        status: "RECONCILED",
      }),
      makeProcedureRow({
        patientId: "p-1",
        billedAmount: 100,
        paidAmount: 30,
        status: "PARTIALLY_RECONCILED",
      }),
      makeProcedureRow({
        patientId: "p-2",
        billedAmount: 60,
        paidAmount: null,
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

describe("formatProcedureOrchestrationError - F27 Layer 3 (pure code → key mapping)", () => {
  // --- ProcedureOrchestrationTask (use-case guards) ---
  it("maps PatientNotFound to its key WITH the patient id as a param", () => {
    const err: ProcedureOrchestrationError = { code: "PatientNotFound", patient_id: "pat-9" };
    expect(formatProcedureOrchestrationError(err)).toEqual({
      key: "procedure:errors.patient_not_found",
      params: { id: "pat-9" },
    });
  });

  it("maps FundNotFound to its key WITH the fund id as a param", () => {
    const err: ProcedureOrchestrationError = { code: "FundNotFound", fund_id: "fund-3" };
    expect(formatProcedureOrchestrationError(err)).toEqual({
      key: "procedure:errors.fund_not_found",
      params: { id: "fund-3" },
    });
  });

  it("maps ProcedureDeleteBlocked to its key, no params", () => {
    const err: ProcedureOrchestrationError = { code: "ProcedureDeleteBlocked" };
    expect(formatProcedureOrchestrationError(err)).toEqual({
      key: "procedure:errors.delete_blocked",
    });
  });

  it("maps InvalidProcedureDate to its key", () => {
    const err: ProcedureOrchestrationError = { code: "InvalidProcedureDate" };
    expect(formatProcedureOrchestrationError(err)).toEqual({
      key: "procedure:errors.invalid_procedure_date",
    });
  });

  // --- ProcedureError (BC arm), incl. the new ProcedureNotFound ---
  it("maps ProcedureNotFound to its key WITH the procedure id as a param", () => {
    const err: ProcedureOrchestrationError = { code: "ProcedureNotFound", procedure_id: "proc-2" };
    expect(formatProcedureOrchestrationError(err)).toEqual({
      key: "procedure:errors.procedure_not_found",
      params: { id: "proc-2" },
    });
  });

  it("maps ProcedureTypeNotFound to its key WITH the type id as a param", () => {
    const err: ProcedureOrchestrationError = {
      code: "ProcedureTypeNotFound",
      procedure_type_id: "pt-1",
    };
    expect(formatProcedureOrchestrationError(err)).toEqual({
      key: "procedure:errors.procedure_type_not_found",
      params: { id: "pt-1" },
    });
  });

  it("maps the remaining BC variants to their keys without params", () => {
    const cases: Array<[ProcedureOrchestrationError, string]> = [
      [{ code: "PatientIdEmpty" }, "procedure:errors.patient_id_empty"],
      [{ code: "ProcedureTypeIdEmpty" }, "procedure:errors.procedure_type_id_empty"],
      [{ code: "ProcedureTypeNameEmpty" }, "procedure:errors.procedure_type_name_empty"],
      [{ code: "DefaultAmountNegative" }, "procedure:errors.default_amount_negative"],
      [{ code: "ProcedureTypeNameDuplicate" }, "procedure:errors.procedure_type_name_duplicate"],
      [{ code: "ReservedTypeNotMutable" }, "procedure:errors.reserved_type_not_mutable"],
      [{ code: "RefundReasonTooLong" }, "procedure:errors.refund_reason_too_long"],
      [{ code: "InvalidRefundDateFormat" }, "procedure:errors.invalid_refund_date_format"],
      [{ code: "DatabaseError" }, "procedure:errors.database_error"],
    ];
    for (const [err, key] of cases) {
      expect(formatProcedureOrchestrationError(err)).toEqual({ key });
    }
  });
});
