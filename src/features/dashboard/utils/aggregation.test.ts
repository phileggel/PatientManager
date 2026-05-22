import { describe, expect, it } from "vitest";
import { makeProcedure, makeProcedureType } from "@/tests/procedure.factory";
import { aggregateDashboardMetrics, getAvailableYears } from "./aggregation";

describe("getAvailableYears", () => {
  it("returns empty array for no procedures", () => {
    expect(getAvailableYears([])).toEqual([]);
  });

  it("extracts year from procedure_date", () => {
    const procedures = [
      makeProcedure({
        procedure_date: "2025-03-15",
        fund_reconciliation_date: "",
        confirmed_payment_date: "",
      }),
    ];
    expect(getAvailableYears(procedures)).toEqual([2025]);
  });

  it("extracts year from confirmed_payment_date", () => {
    const procedures = [
      makeProcedure({
        procedure_date: "",
        fund_reconciliation_date: "",
        confirmed_payment_date: "2024-06-01",
      }),
    ];
    expect(getAvailableYears(procedures)).toEqual([2024]);
  });

  it("deduplicates years across procedures", () => {
    const procedures = [
      makeProcedure({
        procedure_date: "2025-01-01",
        fund_reconciliation_date: "",
        confirmed_payment_date: "",
      }),
      makeProcedure({
        procedure_date: "2025-06-01",
        fund_reconciliation_date: "",
        confirmed_payment_date: "",
      }),
    ];
    expect(getAvailableYears(procedures)).toEqual([2025]);
  });

  it("sorts years in descending order", () => {
    const procedures = [
      makeProcedure({
        procedure_date: "2023-01-01",
        fund_reconciliation_date: "",
        confirmed_payment_date: "",
      }),
      makeProcedure({
        procedure_date: "2025-01-01",
        fund_reconciliation_date: "",
        confirmed_payment_date: "",
      }),
      makeProcedure({
        procedure_date: "2024-01-01",
        fund_reconciliation_date: "",
        confirmed_payment_date: "",
      }),
    ];
    expect(getAvailableYears(procedures)).toEqual([2025, 2024, 2023]);
  });

  it("ignores empty/falsy dates", () => {
    const procedures = [
      makeProcedure({
        procedure_date: "",
        fund_reconciliation_date: "",
        confirmed_payment_date: "",
      }),
    ];
    expect(getAvailableYears(procedures)).toEqual([]);
  });
});

describe("aggregateDashboardMetrics", () => {
  const pt = makeProcedureType({ id: "pt-1", category: "Consultation" });
  const UNCATEGORIZED = "Uncategorized";

  it("returns 12 months initialized to zero with no procedures", () => {
    const result = aggregateDashboardMetrics([], [], 2025, UNCATEGORIZED);

    expect(Object.keys(result.procedures)).toHaveLength(12);
    expect(result.procedures[1]?.procedureCount).toBe(0);
    expect(result.annualProcedureCount).toBe(0);
  });

  it("counts procedures in selected year by procedure_date", () => {
    const proc = makeProcedure({
      procedure_date: "2025-03-10",
      procedure_type_id: "pt-1",
      fund_reconciliation_date: "",

      confirmed_payment_date: "",
    });
    const result = aggregateDashboardMetrics([proc], [pt], 2025, UNCATEGORIZED);

    expect(result.procedures[3]?.procedureCount).toBe(1);
    expect(result.annualProcedureCount).toBe(1);
  });

  it("excludes procedures from other years", () => {
    const proc = makeProcedure({
      procedure_date: "2024-03-10",
      fund_reconciliation_date: "",
      confirmed_payment_date: "",
    });
    const result = aggregateDashboardMetrics([proc], [], 2025, UNCATEGORIZED);

    expect(result.annualProcedureCount).toBe(0);
  });

  it("accumulates billed_amount by category per month", () => {
    const proc1 = makeProcedure({
      procedure_date: "2025-01-05",
      procedure_type_id: "pt-1",
      billed_amount: 25000,
      fund_reconciliation_date: "",

      confirmed_payment_date: "",
    });
    const proc2 = makeProcedure({
      procedure_date: "2025-01-20",
      procedure_type_id: "pt-1",
      billed_amount: 15000,
      fund_reconciliation_date: "",

      confirmed_payment_date: "",
    });
    const result = aggregateDashboardMetrics([proc1, proc2], [pt], 2025, UNCATEGORIZED);

    expect(result.procedures[1]?.amounts["Consultation"]).toBe(40000);
  });

  it("uses uncategorizedLabel when procedure_type_id has no matching type", () => {
    const proc = makeProcedure({
      procedure_date: "2025-05-01",
      procedure_type_id: "unknown",
      billed_amount: 10000,
      fund_reconciliation_date: "",

      confirmed_payment_date: "",
    });
    const result = aggregateDashboardMetrics([proc], [], 2025, UNCATEGORIZED);

    expect(result.procedures[5]?.amounts[UNCATEGORIZED]).toBe(10000);
  });

  it("counts payments by confirmed_payment_date", () => {
    const proc = makeProcedure({
      procedure_date: "2024-12-01",
      fund_reconciliation_date: "",

      confirmed_payment_date: "2025-02-15",
      paid_amount: 30000,
      procedure_type_id: "pt-1",
    });
    const result = aggregateDashboardMetrics([proc], [pt], 2025, UNCATEGORIZED);

    expect(result.payments[2]?.procedureCount).toBe(1);
    expect(result.payments[2]?.amounts["Consultation"]).toBe(30000);
  });

  it("skips payment when paid_amount is null", () => {
    const proc = makeProcedure({
      fund_reconciliation_date: "",

      confirmed_payment_date: "2025-01-10",
      paid_amount: null,
    });
    const result = aggregateDashboardMetrics([proc], [], 2025, UNCATEGORIZED);

    expect(result.payments[1]?.procedureCount).toBe(0);
  });

  it("counts distinct patients per month (not duplicated)", () => {
    const proc1 = makeProcedure({
      patient_id: "p-1",
      procedure_date: "2025-03-01",
      fund_reconciliation_date: "",

      confirmed_payment_date: "",
    });
    const proc2 = makeProcedure({
      patient_id: "p-1",
      procedure_date: "2025-03-15",
      fund_reconciliation_date: "",

      confirmed_payment_date: "",
    });
    const result = aggregateDashboardMetrics([proc1, proc2], [], 2025, UNCATEGORIZED);

    expect(result.procedures[3]?.distinctPatients).toBe(1);
  });

  it("counts distinct patients across months (annualDistinctPatientsProcedures)", () => {
    const proc1 = makeProcedure({
      patient_id: "p-1",
      procedure_date: "2025-01-01",
      fund_reconciliation_date: "",

      confirmed_payment_date: "",
    });
    const proc2 = makeProcedure({
      patient_id: "p-2",
      procedure_date: "2025-06-01",
      fund_reconciliation_date: "",

      confirmed_payment_date: "",
    });
    const proc3 = makeProcedure({
      patient_id: "p-1",
      procedure_date: "2025-09-01",
      fund_reconciliation_date: "",

      confirmed_payment_date: "",
    });
    const result = aggregateDashboardMetrics([proc1, proc2, proc3], [], 2025, UNCATEGORIZED);

    expect(result.annualDistinctPatientsProcedures).toBe(2);
  });

  it("returns sorted categories list", () => {
    const ptA = makeProcedureType({ id: "a", category: "Zebra" });
    const ptB = makeProcedureType({ id: "b", category: "Alpha" });
    const result = aggregateDashboardMetrics([], [ptA, ptB], 2025, UNCATEGORIZED);

    expect(result.categories).toEqual(["Alpha", "Zebra"]);
  });

  it("falls back to uncategorizedLabel for procedure type with null category", () => {
    const ptNoCategory = makeProcedureType({ id: "nc", category: null });
    const result = aggregateDashboardMetrics([], [ptNoCategory], 2025, UNCATEGORIZED);

    expect(result.categories).toContain(UNCATEGORIZED);
  });
});
