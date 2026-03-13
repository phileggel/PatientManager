/// <reference types="vitest/globals" />

import type { AffiliatedFund, ProcedureType } from "@/bindings";
import { makePatient } from "@/tests/patient.factory";
import type { ProcedureRow } from "./procedure-row.types";
import { reduceWorkflowState } from "./workflow.reducer";
import type { WorkflowEvent, WorkflowState } from "./workflow.types";

// ============================================================================
// Test Helpers & Mocks
// ============================================================================

const createMockFund = (overrides?: Partial<AffiliatedFund>): AffiliatedFund => ({
  id: "fund-1",
  fund_identifier: "440",
  name: "CPAM Loire-Atlantique",
  temp_id: null,
  ...overrides,
});

const createMockProcedureType = (overrides?: Partial<ProcedureType>): ProcedureType => ({
  id: "procedure-1",
  name: "Consultation",
  default_amount: 25000, // 25.00€ in thousandths
  category: "test",
  ...overrides,
});

const createMockDraftRow = (overrides?: Partial<ProcedureRow>): ProcedureRow => ({
  rowId: "row-1",
  isDraft: true,
  draftPeriod: null,
  patientId: null,
  patientName: null,
  ssn: null,
  fundId: null,
  fundIdentifier: null,
  fundName: null,
  procedureTypeId: null,
  procedureName: null,
  procedureDate: null,
  procedureAmount: 0,
  paymentMethod: null,
  confirmedPaymentDate: null,
  awaitedAmount: null,
  status: "CREATED",
  actualPaymentAmount: null,
  ...overrides,
});

const createInitialState = (overrides?: Partial<WorkflowState>): WorkflowState => ({
  focusedRowId: null,
  currentStep: "IDLE",
  editingRow: null,
  ...overrides,
});

// ============================================================================
// EVENT_FOCUS_CELL Tests
// ============================================================================

describe("reduceWorkflowState - EVENT_FOCUS_CELL", () => {
  test("initializes workflow with new row and latest date hint", () => {
    const state = createInitialState();
    const draftRow = createMockDraftRow();
    const event: WorkflowEvent = {
      type: "EVENT_FOCUS_CELL",
      rowId: "row-1",
      clickedStep: "PATIENT_SELECTION",
      initialRows: [draftRow],
      latestDateHint: "2026-01-15",
    };

    const newState = reduceWorkflowState(state, event);

    expect(newState.focusedRowId).toBe("row-1");
    expect(newState.currentStep).toBe("PATIENT_SELECTION");
    expect(newState.editingRow?.rowId).toBe("row-1");
    expect(newState.editingRow?.procedureDate).toBe("2026-01-15");
  });

  test("does not override existing date when focusing non-draft row", () => {
    const state = createInitialState();
    const existingRow = createMockDraftRow({
      isDraft: false,
      procedureDate: "2026-01-10",
    });
    const event: WorkflowEvent = {
      type: "EVENT_FOCUS_CELL",
      rowId: "row-1",
      clickedStep: "PATIENT_SELECTION",
      initialRows: [existingRow],
      latestDateHint: "2026-01-15",
    };

    const newState = reduceWorkflowState(state, event);

    expect(newState.editingRow?.procedureDate).toBe("2026-01-10");
  });

  test("is no-op when clicking same cell on same row", () => {
    const state = createInitialState({
      focusedRowId: "row-1",
      currentStep: "PATIENT_SELECTION",
      editingRow: createMockDraftRow(),
    });
    const event: WorkflowEvent = {
      type: "EVENT_FOCUS_CELL",
      rowId: "row-1",
      clickedStep: "PATIENT_SELECTION",
      initialRows: [createMockDraftRow()],
    };

    const newState = reduceWorkflowState(state, event);

    expect(newState).toBe(state);
  });

  test("allows jumping to different cell on same row without losing editingRow", () => {
    const existingEditingRow = createMockDraftRow({
      patientId: "patient-1",
      patientName: "Marie Dupont",
    });
    const state = createInitialState({
      focusedRowId: "row-1",
      currentStep: "PATIENT_SELECTION",
      editingRow: existingEditingRow,
    });
    const event: WorkflowEvent = {
      type: "EVENT_FOCUS_CELL",
      rowId: "row-1",
      clickedStep: "FUND_SELECTION",
      initialRows: [createMockDraftRow()],
    };

    const newState = reduceWorkflowState(state, event);

    expect(newState.focusedRowId).toBe("row-1");
    expect(newState.currentStep).toBe("FUND_SELECTION");
    expect(newState.editingRow).toBe(existingEditingRow); // Preserved!
  });

  test("ignores event if target row not found in initialRows", () => {
    const state = createInitialState();
    const event: WorkflowEvent = {
      type: "EVENT_FOCUS_CELL",
      rowId: "non-existent-row",
      clickedStep: "PATIENT_SELECTION",
      initialRows: [createMockDraftRow({ rowId: "row-1" })],
    };

    const newState = reduceWorkflowState(state, event);

    expect(newState).toBe(state);
  });
});

// ============================================================================
// EVENT_SELECT_PATIENT Tests
// ============================================================================

describe("reduceWorkflowState - EVENT_SELECT_PATIENT", () => {
  test("updates editingRow with patient data and advances to next step", () => {
    const patient = makePatient();
    const state = createInitialState({
      focusedRowId: "row-1",
      currentStep: "PATIENT_SELECTION",
      editingRow: createMockDraftRow(),
    });
    const event: WorkflowEvent = {
      type: "EVENT_SELECT_PATIENT",
      patient,
    };

    const newState = reduceWorkflowState(state, event);

    expect(newState.editingRow?.patientId).toBe("patient-1");
    expect(newState.editingRow?.patientName).toBe("Marie Dupont");
    expect(newState.editingRow?.ssn).toBe("1234567890123");
    expect(newState.currentStep).toBe("FUND_SELECTION");
  });

  test("returns unchanged state if editingRow is null", () => {
    const state = createInitialState({
      focusedRowId: "row-1",
      currentStep: "PATIENT_SELECTION",
      editingRow: null,
    });
    const event: WorkflowEvent = {
      type: "EVENT_SELECT_PATIENT",
      patient: makePatient(),
    };

    const newState = reduceWorkflowState(state, event);

    expect(newState).toBe(state);
  });

  test("auto-fills tracking fields on draft row with empty fields", () => {
    const patient = makePatient({
      latest_fund: "fund-1",
      latest_procedure_type: "procedure-1",
      latest_procedure_amount: 150,
    });
    const fund = createMockFund();
    const procedureType = createMockProcedureType();
    const state = createInitialState({
      focusedRowId: "row-1",
      currentStep: "PATIENT_SELECTION",
      editingRow: createMockDraftRow({ isDraft: true, procedureAmount: null }),
    });
    const event: WorkflowEvent = {
      type: "EVENT_SELECT_PATIENT",
      patient,
      trackedFund: fund,
      trackedProcedureType: procedureType,
      trackedAmount: 150,
    };

    const newState = reduceWorkflowState(state, event);

    expect(newState.editingRow?.fundId).toBe("fund-1");
    expect(newState.editingRow?.fundIdentifier).toBe("440");
    expect(newState.editingRow?.fundName).toBe("CPAM Loire-Atlantique");
    expect(newState.editingRow?.procedureTypeId).toBe("procedure-1");
    expect(newState.editingRow?.procedureName).toBe("Consultation");
    expect(newState.editingRow?.procedureAmount).toBe(150);
  });

  test("does not auto-fill tracking fields on non-draft row", () => {
    const patient = makePatient({
      latest_fund: "fund-1",
      latest_procedure_type: "type-1",
      latest_procedure_amount: 150,
    });
    const fund = createMockFund();
    const procedureType = createMockProcedureType();
    const state = createInitialState({
      focusedRowId: "row-1",
      currentStep: "PATIENT_SELECTION",
      editingRow: createMockDraftRow({ isDraft: false }),
    });
    const event: WorkflowEvent = {
      type: "EVENT_SELECT_PATIENT",
      patient,
      trackedFund: fund,
      trackedProcedureType: procedureType,
      trackedAmount: 150,
    };

    const newState = reduceWorkflowState(state, event);

    expect(newState.editingRow?.fundId).toBeNull();
    expect(newState.editingRow?.procedureTypeId).toBeNull();
    expect(newState.editingRow?.procedureAmount).toBe(0);
  });
});

// ============================================================================
// EVENT_SELECT_FUND Tests
// ============================================================================

describe("reduceWorkflowState - EVENT_SELECT_FUND", () => {
  test("updates editingRow with fund data and advances to next step", () => {
    const fund = createMockFund();
    const state = createInitialState({
      focusedRowId: "row-1",
      currentStep: "FUND_SELECTION",
      editingRow: createMockDraftRow({
        patientId: "patient-1",
        patientName: "Marie Dupont",
      }),
    });
    const event: WorkflowEvent = {
      type: "EVENT_SELECT_FUND",
      fund,
    };

    const newState = reduceWorkflowState(state, event);

    expect(newState.editingRow?.fundId).toBe("fund-1");
    expect(newState.editingRow?.fundIdentifier).toBe("440");
    expect(newState.editingRow?.fundName).toBe("CPAM Loire-Atlantique");
    expect(newState.currentStep).toBe("PROCEDURE_SELECTION");
  });

  test("returns unchanged state if editingRow is null", () => {
    const state = createInitialState({
      focusedRowId: "row-1",
      currentStep: "FUND_SELECTION",
      editingRow: null,
    });
    const event: WorkflowEvent = {
      type: "EVENT_SELECT_FUND",
      fund: createMockFund(),
    };

    const newState = reduceWorkflowState(state, event);

    expect(newState).toBe(state);
  });
});

// ============================================================================
// EVENT_SELECT_PROCEDURE_TYPE Tests
// ============================================================================

describe("reduceWorkflowState - EVENT_SELECT_PROCEDURE_TYPE", () => {
  test("updates editingRow with procedure type and default amount, advances to next step", () => {
    const procedureType = createMockProcedureType();
    const state = createInitialState({
      focusedRowId: "row-1",
      currentStep: "PROCEDURE_SELECTION",
      editingRow: createMockDraftRow({
        patientId: "patient-1",
        fundId: "fund-1",
      }),
    });
    const event: WorkflowEvent = {
      type: "EVENT_SELECT_PROCEDURE_TYPE",
      procedureType,
    };

    const newState = reduceWorkflowState(state, event);

    expect(newState.editingRow?.procedureTypeId).toBe("procedure-1");
    expect(newState.editingRow?.procedureName).toBe("Consultation");
    expect(newState.editingRow?.procedureAmount).toBe(25.0);
    expect(newState.currentStep).toBe("DATE_ENTRY");
  });

  test("returns unchanged state if editingRow is null", () => {
    const state = createInitialState({
      focusedRowId: "row-1",
      currentStep: "PROCEDURE_SELECTION",
      editingRow: null,
    });
    const event: WorkflowEvent = {
      type: "EVENT_SELECT_PROCEDURE_TYPE",
      procedureType: createMockProcedureType(),
    };

    const newState = reduceWorkflowState(state, event);

    expect(newState).toBe(state);
  });
});

// ============================================================================
// EVENT_ENTER_DATE Tests
// ============================================================================

describe("reduceWorkflowState - EVENT_ENTER_DATE", () => {
  test("updates date and advances to next step", () => {
    const state = createInitialState({
      focusedRowId: "row-1",
      currentStep: "DATE_ENTRY",
      editingRow: createMockDraftRow({
        patientId: "patient-1",
        fundId: "fund-1",
        procedureTypeId: "procedure-1",
      }),
    });
    const event: WorkflowEvent = {
      type: "EVENT_ENTER_DATE",
      date: "2026-01-15",
    };

    const newState = reduceWorkflowState(state, event);

    expect(newState.editingRow?.procedureDate).toBe("2026-01-15");
    expect(newState.currentStep).toBe("AMOUNT_ENTRY");
  });

  test("returns unchanged state if editingRow is null", () => {
    const state = createInitialState({
      focusedRowId: "row-1",
      currentStep: "DATE_ENTRY",
      editingRow: null,
    });
    const event: WorkflowEvent = {
      type: "EVENT_ENTER_DATE",
      date: "2026-01-15",
    };

    const newState = reduceWorkflowState(state, event);

    expect(newState).toBe(state);
  });
});

// ============================================================================
// EVENT_ENTER_AMOUNT Tests
// ============================================================================

describe("reduceWorkflowState - EVENT_ENTER_AMOUNT", () => {
  test("updates amount and advances to SAVING when draft row is complete", () => {
    const state = createInitialState({
      focusedRowId: "row-1",
      currentStep: "AMOUNT_ENTRY",
      editingRow: createMockDraftRow({
        patientId: "patient-1",
        fundId: "fund-1",
        procedureTypeId: "procedure-1",
        procedureDate: "2026-01-15",
        procedureAmount: 0,
      }),
    });
    const event: WorkflowEvent = {
      type: "EVENT_ENTER_AMOUNT",
      amount: 50.0,
    };

    const newState = reduceWorkflowState(state, event);

    expect(newState.editingRow?.procedureAmount).toBe(50.0);
    expect(newState.currentStep).toBe("SAVING");
  });

  test("does not advance to SAVING if row is incomplete", () => {
    const state = createInitialState({
      focusedRowId: "row-1",
      currentStep: "AMOUNT_ENTRY",
      editingRow: createMockDraftRow({
        patientId: "patient-1",
        // Missing fundId, procedureTypeId, procedureDate
        procedureAmount: 0,
      }),
    });
    const event: WorkflowEvent = {
      type: "EVENT_ENTER_AMOUNT",
      amount: 50.0,
    };

    const newState = reduceWorkflowState(state, event);

    expect(newState.editingRow?.procedureAmount).toBe(50.0);
    expect(newState.currentStep).toBe("AMOUNT_ENTRY"); // Stays on same step
  });

  test("immediately advances to SAVING for existing (non-draft) row", () => {
    const state = createInitialState({
      focusedRowId: "row-1",
      currentStep: "AMOUNT_ENTRY",
      editingRow: createMockDraftRow({
        isDraft: false,
        patientId: "patient-1",
        procedureAmount: 25.0,
      }),
    });
    const event: WorkflowEvent = {
      type: "EVENT_ENTER_AMOUNT",
      amount: 50.0,
    };

    const newState = reduceWorkflowState(state, event);

    expect(newState.editingRow?.procedureAmount).toBe(50.0);
    expect(newState.currentStep).toBe("SAVING");
  });

  test("returns unchanged state if editingRow is null", () => {
    const state = createInitialState({
      focusedRowId: "row-1",
      currentStep: "AMOUNT_ENTRY",
      editingRow: null,
    });
    const event: WorkflowEvent = {
      type: "EVENT_ENTER_AMOUNT",
      amount: 50.0,
    };

    const newState = reduceWorkflowState(state, event);

    expect(newState).toBe(state);
  });
});

// ============================================================================
// EVENT_UPDATE_DRAFT Tests
// ============================================================================

describe("reduceWorkflowState - EVENT_UPDATE_DRAFT", () => {
  test("updates editingRow fields without advancing step", () => {
    const state = createInitialState({
      focusedRowId: "row-1",
      currentStep: "PATIENT_SELECTION",
      editingRow: createMockDraftRow(),
    });
    const event: WorkflowEvent = {
      type: "EVENT_UPDATE_DRAFT",
      fields: { patientName: "Marie Curie" },
    };

    const newState = reduceWorkflowState(state, event);

    expect(newState.editingRow?.patientName).toBe("Marie Curie");
    expect(newState.currentStep).toBe("PATIENT_SELECTION"); // No step change
  });

  test("returns state with null editingRow if editingRow was null", () => {
    const state = createInitialState({
      focusedRowId: "row-1",
      currentStep: "PATIENT_SELECTION",
      editingRow: null,
    });
    const event: WorkflowEvent = {
      type: "EVENT_UPDATE_DRAFT",
      fields: { patientName: "Test" },
    };

    const newState = reduceWorkflowState(state, event);

    expect(newState.editingRow).toBeNull();
    expect(newState.focusedRowId).toBe("row-1");
    expect(newState.currentStep).toBe("PATIENT_SELECTION");
  });
});

// ============================================================================
// EVENT_CANCEL Tests
// ============================================================================

describe("reduceWorkflowState - EVENT_CANCEL", () => {
  test("resets workflow to IDLE state", () => {
    const state = createInitialState({
      focusedRowId: "row-1",
      currentStep: "PATIENT_SELECTION",
      editingRow: createMockDraftRow({
        patientId: "patient-1",
        patientName: "Marie Dupont",
      }),
    });
    const event: WorkflowEvent = {
      type: "EVENT_CANCEL",
    };

    const newState = reduceWorkflowState(state, event);

    expect(newState.focusedRowId).toBeNull();
    expect(newState.currentStep).toBe("IDLE");
    expect(newState.editingRow).toBeNull();
  });
});

// ============================================================================
// EVENT_COMMIT_SUCCESS Tests
// ============================================================================

describe("reduceWorkflowState - EVENT_COMMIT_SUCCESS", () => {
  test("resets workflow to IDLE state after successful save", () => {
    const state = createInitialState({
      focusedRowId: "row-1",
      currentStep: "SAVING",
      editingRow: createMockDraftRow({
        patientId: "patient-1",
        fundId: "fund-1",
        procedureTypeId: "procedure-1",
        procedureDate: "2026-01-15",
        procedureAmount: 50.0,
      }),
    });
    const event: WorkflowEvent = {
      type: "EVENT_COMMIT_SUCCESS",
    };

    const newState = reduceWorkflowState(state, event);

    expect(newState.focusedRowId).toBeNull();
    expect(newState.currentStep).toBe("IDLE");
    expect(newState.editingRow).toBeNull();
  });
});

// ============================================================================
// Integration Tests - Complete Workflow
// ============================================================================

describe("reduceWorkflowState - Complete Workflow Integration", () => {
  test("completes full workflow from IDLE to SAVING", () => {
    const draftRow = createMockDraftRow();
    let state = createInitialState();

    // 1. Focus cell
    state = reduceWorkflowState(state, {
      type: "EVENT_FOCUS_CELL",
      rowId: "row-1",
      clickedStep: "PATIENT_SELECTION",
      initialRows: [draftRow],
      latestDateHint: "2026-01-15",
    });
    expect(state.currentStep).toBe("PATIENT_SELECTION");

    // 2. Select patient
    state = reduceWorkflowState(state, {
      type: "EVENT_SELECT_PATIENT",
      patient: makePatient(),
    });
    expect(state.currentStep).toBe("FUND_SELECTION");
    expect(state.editingRow?.patientId).toBe("patient-1");

    // 3. Select fund
    state = reduceWorkflowState(state, {
      type: "EVENT_SELECT_FUND",
      fund: createMockFund(),
    });
    expect(state.currentStep).toBe("PROCEDURE_SELECTION");
    expect(state.editingRow?.fundId).toBe("fund-1");

    // 4. Select procedure type
    state = reduceWorkflowState(state, {
      type: "EVENT_SELECT_PROCEDURE_TYPE",
      procedureType: createMockProcedureType(),
    });
    expect(state.currentStep).toBe("DATE_ENTRY");
    expect(state.editingRow?.procedureTypeId).toBe("procedure-1");
    expect(state.editingRow?.procedureAmount).toBe(25.0);

    // 5. Enter date
    state = reduceWorkflowState(state, {
      type: "EVENT_ENTER_DATE",
      date: "2026-01-20",
    });
    expect(state.currentStep).toBe("AMOUNT_ENTRY");
    expect(state.editingRow?.procedureDate).toBe("2026-01-20");

    // 6. Enter amount (triggers save)
    state = reduceWorkflowState(state, {
      type: "EVENT_ENTER_AMOUNT",
      amount: 50.0,
    });
    expect(state.currentStep).toBe("SAVING");
    expect(state.editingRow?.procedureAmount).toBe(50.0);

    // 7. Commit success
    state = reduceWorkflowState(state, {
      type: "EVENT_COMMIT_SUCCESS",
    });
    expect(state.currentStep).toBe("IDLE");
    expect(state.editingRow).toBeNull();
  });

  test("allows cancellation at any step", () => {
    let state = createInitialState({
      focusedRowId: "row-1",
      currentStep: "FUND_SELECTION",
      editingRow: createMockDraftRow({ patientId: "patient-1" }),
    });

    state = reduceWorkflowState(state, { type: "EVENT_CANCEL" });

    expect(state.currentStep).toBe("IDLE");
    expect(state.focusedRowId).toBeNull();
    expect(state.editingRow).toBeNull();
  });
});
