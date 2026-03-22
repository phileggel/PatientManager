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

vi.mock("@/lib/appStore", () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof mockState) => unknown) => selector(mockState),
    {
      getState: () => mockState,
    },
  ),
}));

describe("useProcedureData", () => {
  test("loads and maps procedures, resolving patient name from store", async () => {
    vi.mocked(gateway.readAllProcedures).mockResolvedValue([
      {
        id: "proc1",
        patient_id: "p1",
        fund_id: null,
        procedure_type_id: "type1",
        procedure_date: "2026-01-15",
        procedure_amount: 50000,
        payment_method: "NONE",
        confirmed_payment_date: "",
        actual_payment_amount: null,
        payment_status: "CREATED",
      } satisfies Procedure,
    ]);

    const { result } = renderHook(() => useProcedureData());

    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 1000 });

    expect(result.current.initialRows).toHaveLength(1);
    expect(result.current.initialRows[0]?.patientName).toBe("John");
    expect(result.current.initialRows[0]?.procedureAmount).toBe(50); // 50000 / 1000
  });

  test("deleteRow calls gateway.deleteProcedure with the given id", async () => {
    vi.mocked(gateway.readAllProcedures).mockResolvedValue([]);
    vi.mocked(gateway.deleteProcedure).mockResolvedValue(undefined);

    const { result } = renderHook(() => useProcedureData());
    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 1000 });

    await result.current.deleteRow("proc1");

    expect(gateway.deleteProcedure).toHaveBeenCalledWith("proc1");
  });
});
