/// <reference types="vitest/globals" />

import { renderHook, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import type { Patient, Procedure } from "@/bindings";
import * as gateway from "../api/gateway";
import { useProcedureData } from "./useProcedureData";

vi.mock("../api/gateway");

const mockPatient: Patient = {
  id: "p1",
  name: "John",
  ssn: null,
  latest_date: "",
  latest_procedure_amount: null,
  latest_fund: null,
  latest_procedure_type: null,
  is_anonymous: false,
  temp_id: null,
};

const mockState = { patients: [mockPatient], funds: [], procedureTypes: [] };

vi.mock("@/infra/cache/store", () => ({
  useCacheStore: Object.assign(
    (selector: (state: typeof mockState) => unknown) => selector(mockState),
    {
      getState: () => mockState,
    },
  ),
}));

describe("useProcedureData", () => {
  test("loads and maps procedures, resolving patient name from store", async () => {
    vi.mocked(gateway.readAllProcedures).mockResolvedValue({
      success: true,
      data: [
        {
          id: "proc1",
          patient_id: "p1",
          fund_id: null,
          procedure_type_id: "type1",
          procedure_date: "2026-01-15",
          billed_amount: 50000,
          payment_method: "NONE",
          fund_reconciliation_date: "",

          confirmed_payment_date: "",
          paid_amount: null,
          payment_status: "CREATED",
        } satisfies Procedure,
      ],
    });

    const { result } = renderHook(() => useProcedureData());

    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 1000 });

    expect(result.current.initialRows).toHaveLength(1);
    expect(result.current.initialRows[0]?.patientName).toBe("John");
    expect(result.current.initialRows[0]?.billedAmount).toBe(50); // 50000 / 1000
  });

  test("deleteRow calls gateway.deleteProcedure with the given id", async () => {
    vi.mocked(gateway.readAllProcedures).mockResolvedValue({ success: true, data: [] });
    vi.mocked(gateway.deleteProcedure).mockResolvedValue({ success: true, data: undefined });

    const { result } = renderHook(() => useProcedureData());
    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 1000 });

    await result.current.deleteRow("proc1");

    expect(gateway.deleteProcedure).toHaveBeenCalledWith("proc1");
  });

  test("surfaces error state when readAllProcedures fails", async () => {
    vi.mocked(gateway.readAllProcedures).mockResolvedValue({
      success: false,
      error: { code: "DatabaseError" },
    });

    const { result } = renderHook(() => useProcedureData());
    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 1000 });

    // Error is the typed code translated at render (F27 Layer 4).
    expect(result.current.error).toBeTruthy();
    expect(result.current.initialRows).toHaveLength(0);
  });

  test("deleteRow throws when gateway.deleteProcedure fails", async () => {
    vi.mocked(gateway.readAllProcedures).mockResolvedValue({ success: true, data: [] });
    vi.mocked(gateway.deleteProcedure).mockResolvedValue({
      success: false,
      error: { code: "ProcedureDeleteBlocked" },
    });

    const { result } = renderHook(() => useProcedureData());
    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 1000 });

    await expect(result.current.deleteRow("proc1")).rejects.toThrow();
  });
});
