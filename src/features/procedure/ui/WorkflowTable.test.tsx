/// <reference types="vitest/globals" />

import { render, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import type { ProcedureRow } from "../model";
import { WorkflowTable } from "./WorkflowTable";

vi.mock("../hooks/useProcedureFormModals", () => ({
  useProcedureFormModals: () => ({
    patient: { isOpen: false, open: vi.fn(), close: vi.fn() },
    fund: { isOpen: false, open: vi.fn(), close: vi.fn() },
    procedureType: { isOpen: false, open: vi.fn(), close: vi.fn() },
  }),
}));

vi.mock("./form/CreationHub", () => ({
  CreateFormHub: () => <div>Creation Hub</div>,
}));

vi.mock("./WorkflowRow", () => ({
  WorkflowRow: () => (
    <tr>
      <td>Row</td>
    </tr>
  ),
}));

describe("WorkflowTable", () => {
  test("syncs draft changes to parent state for persistence across period switches", async () => {
    const onRowUiSync = vi.fn();
    const draftRow: ProcedureRow = {
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
      procedureAmount: 0,
      paymentMethod: null,
      confirmedPaymentDate: null,
      awaitedAmount: null,
      status: "CREATED",
      actualPaymentAmount: null,
    };

    render(
      <WorkflowTable
        month={2}
        year={2026}
        initialRows={[draftRow]}
        allPatients={[]}
        allFunds={[]}
        allProcedureTypes={[]}
        onAddNewRow={vi.fn()}
        onRowUiSync={onRowUiSync}
        persistNewRow={vi.fn()}
        persistUpdateRow={vi.fn()}
        persistNewPatient={vi.fn()}
        persistNewFund={vi.fn()}
        persistNewProcedureType={vi.fn()}
      />,
    );

    // Auto-focus should trigger on the draft, which updates editingRow
    // Then the sync effect should call onRowUiSync
    await waitFor(
      () => {
        expect(onRowUiSync).toHaveBeenCalled();
        const lastCall = onRowUiSync.mock.calls[onRowUiSync.mock.calls.length - 1];
        expect(lastCall).toBeDefined();
        expect(lastCall?.[0]).toBe("draft1"); // rowId
        expect(lastCall?.[1].isDraft).toBe(true); // synced row data
      },
      { timeout: 2000 },
    );
  });
});
