/// <reference types="vitest/globals" />

import { renderHook, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import type { Patient, Procedure } from "@/bindings";
import * as gateway from "../api/gateway";
import type { ProcedureRow } from "../model";
import { useProcedureData } from "./useProcedureData";

vi.mock("../api/gateway");

vi.mock("@/lib/appStore", () => ({
  useAppStore: (selector: (state: unknown) => unknown) => {
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
    const state = { patients: [mockPatient], funds: [], procedureTypes: [] };
    return selector(state);
  },
}));

describe("useProcedureData", () => {
  test("saves new procedure using store reference data (no direct patient fetch)", async () => {
    vi.mocked(gateway.readAllProcedures).mockResolvedValue([]);
    vi.mocked(gateway.addProcedure).mockResolvedValue({
      id: "proc1",
      patient_id: "p1",
      fund_id: null,
      procedure_type_id: "type1",
      procedure_date: "2026-01-15",
      procedure_amount: 150,
      payment_method: "NONE",
      confirmed_payment_date: "",
      actual_payment_amount: null,
      payment_status: "CREATED",
    } satisfies Procedure);

    const { result } = renderHook(() => useProcedureData());

    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 1000 });

    const newRow: ProcedureRow = {
      rowId: "row1",
      isDraft: true,
      draftPeriod: null,
      patientId: "p1",
      patientName: null,
      ssn: null,
      fundId: null,
      fundIdentifier: null,
      fundName: null,
      procedureTypeId: "type1",
      procedureName: null,
      procedureDate: "2026-01-15",
      procedureAmount: 150,
      paymentMethod: null,
      confirmedPaymentDate: null,
      awaitedAmount: null,
      status: "CREATED",
      actualPaymentAmount: null,
    };

    const savedRow = await result.current.handlers.saveRow(newRow);

    // Store is the source of truth — no direct patient fetch after save
    expect(gateway.fetchAllPatients).not.toHaveBeenCalled();
    // Procedure was saved via gateway
    expect(gateway.addProcedure).toHaveBeenCalledOnce();
    // Patient name resolved from store data
    expect(savedRow.patientName).toBe("John");
  });
});
