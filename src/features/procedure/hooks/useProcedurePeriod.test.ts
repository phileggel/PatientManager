/// <reference types="vitest/globals" />

import { renderHook } from "@testing-library/react";
import type { ProcedureRow } from "../model";
import { useProcedurePeriod } from "./useProcedurePeriod";

describe("useProcedurePeriod", () => {
  test("filters saved procedures by procedureDate matching selected period", () => {
    const procedures: ProcedureRow[] = [
      {
        rowId: "1",
        isDraft: false,
        draftPeriod: null,
        procedureDate: "2026-02-15",
        patientId: "p1",
        patientName: null,
        ssn: null,

        fundId: null,
        fundIdentifier: null,
        fundName: null,
        procedureTypeId: null,
        procedureName: null,
        procedureAmount: null,
        paymentMethod: null,
        confirmedPaymentDate: null,
        awaitedAmount: null,
        status: "CREATED",
        actualPaymentAmount: null,
      },
      {
        rowId: "2",
        isDraft: false,
        draftPeriod: null,
        procedureDate: "2026-03-10",
        patientId: "p2",
        patientName: null,
        ssn: null,

        fundId: null,
        fundIdentifier: null,
        fundName: null,
        procedureTypeId: null,
        procedureName: null,
        procedureAmount: null,
        paymentMethod: null,
        confirmedPaymentDate: null,
        awaitedAmount: null,
        status: "CREATED",
        actualPaymentAmount: null,
      },
      {
        rowId: "3",
        isDraft: false,
        draftPeriod: null,
        procedureDate: "2026-02-20",
        patientId: "p3",
        patientName: null,
        ssn: null,

        fundId: null,
        fundIdentifier: null,
        fundName: null,
        procedureTypeId: null,
        procedureName: null,
        procedureAmount: null,
        paymentMethod: null,
        confirmedPaymentDate: null,
        awaitedAmount: null,
        status: "CREATED",
        actualPaymentAmount: null,
      },
    ];

    const { result } = renderHook(() => useProcedurePeriod(procedures, 2, 2026));

    expect(result.current.filteredRows).toHaveLength(2);
    expect(result.current.filteredRows[0]?.rowId).toBe("1");
    expect(result.current.filteredRows[1]?.rowId).toBe("3");
  });

  test("filters drafts by draftPeriod matching selected period", () => {
    const procedures: ProcedureRow[] = [
      {
        rowId: "draft1",
        isDraft: true,
        draftPeriod: "2026-02",
        procedureDate: null,
        patientId: null,
        patientName: null,
        ssn: null,

        fundId: null,
        fundIdentifier: null,
        fundName: null,
        procedureTypeId: null,
        procedureName: null,
        procedureAmount: null,
        paymentMethod: null,
        confirmedPaymentDate: null,
        awaitedAmount: null,
        status: "CREATED",
        actualPaymentAmount: null,
      },
      {
        rowId: "draft2",
        isDraft: true,
        draftPeriod: "2026-03",
        procedureDate: null,
        patientId: null,
        patientName: null,
        ssn: null,

        fundId: null,
        fundIdentifier: null,
        fundName: null,
        procedureTypeId: null,
        procedureName: null,
        procedureAmount: null,
        paymentMethod: null,
        confirmedPaymentDate: null,
        awaitedAmount: null,
        status: "CREATED",
        actualPaymentAmount: null,
      },
      {
        rowId: "saved1",
        isDraft: false,
        draftPeriod: null,
        procedureDate: "2026-02-15",
        patientId: "p1",
        patientName: null,
        ssn: null,

        fundId: null,
        fundIdentifier: null,
        fundName: null,
        procedureTypeId: null,
        procedureName: null,
        procedureAmount: null,
        paymentMethod: null,
        confirmedPaymentDate: null,
        awaitedAmount: null,
        status: "CREATED",
        actualPaymentAmount: null,
      },
    ];

    const { result } = renderHook(() => useProcedurePeriod(procedures, 2, 2026));

    expect(result.current.filteredRows).toHaveLength(2);
    // Should include February draft and saved procedure
    expect(result.current.filteredRows.find((r) => r.rowId === "draft1")).toBeDefined();
    expect(result.current.filteredRows.find((r) => r.rowId === "saved1")).toBeDefined();
    // Should NOT include March draft
    expect(result.current.filteredRows.find((r) => r.rowId === "draft2")).toBeUndefined();
  });

  test("calculates yearRange from oldest procedure to current year", () => {
    const procedures: ProcedureRow[] = [
      {
        rowId: "1",
        isDraft: false,
        draftPeriod: null,
        procedureDate: "2024-06-15",
        patientId: null,
        patientName: null,
        ssn: null,

        fundId: null,
        fundIdentifier: null,
        fundName: null,
        procedureTypeId: null,
        procedureName: null,
        procedureAmount: null,
        paymentMethod: null,
        confirmedPaymentDate: null,
        awaitedAmount: null,
        status: "CREATED",
        actualPaymentAmount: null,
      },
      {
        rowId: "2",
        isDraft: false,
        draftPeriod: null,
        procedureDate: "2025-03-10",
        patientId: null,
        patientName: null,
        ssn: null,

        fundId: null,
        fundIdentifier: null,
        fundName: null,
        procedureTypeId: null,
        procedureName: null,
        procedureAmount: null,
        paymentMethod: null,
        confirmedPaymentDate: null,
        awaitedAmount: null,
        status: "CREATED",
        actualPaymentAmount: null,
      },
    ];

    const { result } = renderHook(() => useProcedurePeriod(procedures, 2, 2026));
    const currentYear = new Date().getFullYear();

    expect(result.current.yearRange.min).toBe(2023); // 2024 - 1
    expect(result.current.yearRange.max).toBe(currentYear);
  });
});
