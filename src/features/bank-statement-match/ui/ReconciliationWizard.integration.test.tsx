/**
 * RTL component integration tests — ReconciliationWizard (BAS-116 revised).
 *
 * BAS-116 rework: the wizard is now SETTLEMENT-ONLY — there is no link-fund
 * phase (screen 1 / LabelAssociationScreen owns label association, BAS-120).
 * For each to-decide line the wizard presents:
 *   - the GROUP selector when the line has fund-scoped group candidates, else
 *   - the PROCEDURE selector over the line's WINDOW-FILTERED (BAS-118) open
 *     procedures (the no-bordereau case) — this is new: the former wizard
 *     walked past every group-less line, the revised one visits it via the
 *     procedure selector instead.
 * The wizard still walks past (a) a line with neither group candidates nor
 * window-filtered procedure candidates, and (b) a line that already carries
 * assigned procedures (finishing partial procedure work needs the dialog's
 * remainder/leave-aside actions the wizard doesn't have).
 *
 * Design pin: the component takes `procedureWindowDays` + an optional `now`
 * (defaults to `new Date()`) so the BAS-118 filter is deterministic in tests
 * — mirrors the injected-clock pattern used for `filterProceduresByWindow`.
 *
 * These tests fail until ui/ReconciliationWizard.tsx is reworked.
 */

import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BankStatementLine, BankStatementReconciliation } from "@/bindings";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
    i18n: { language: "fr" },
  }),
}));

import { ReconciliationWizard } from "./ReconciliationWizard";

const NOW = new Date("2026-05-01T00:00:00.000Z");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeNeedsGroupLine(
  id: string,
  overrides: Partial<BankStatementLine> = {},
): BankStatementLine {
  return {
    line_id: id,
    credit_line: { date: "2026-04-11", label: "CPAM75", amount: 200000 },
    status: "NeedsGroup",
    fund_id: "fund-1",
    assigned_group_ids: [],
    assigned_procedure_ids: [],
    covered_amount: 0,
    remainder_acknowledged: false,
    candidate_groups: [
      {
        group_id: "group-1",
        fund_id: "fund-1",
        fund_name: "CPAM Paris",
        payment_date: "2026-04-08",
        total_amount: 200000,
        is_exact_amount: true,
      },
    ],
    broadened_candidates: [],
    candidate_procedures: [],
    suggested_fund_id: null,
    suggested_fund_name: null,
    ...overrides,
  };
}

/** BAS-116 — a line resolvable only via procedures (no group candidate at all). */
function makeProcedureOnlyLine(
  id: string,
  overrides: Partial<BankStatementLine> = {},
): BankStatementLine {
  return {
    line_id: id,
    credit_line: { date: "2026-04-12", label: "RATP", amount: 60000 },
    status: "NeedsGroup",
    fund_id: "fund-2",
    assigned_group_ids: [],
    assigned_procedure_ids: [],
    covered_amount: 0,
    remainder_acknowledged: false,
    candidate_groups: [],
    broadened_candidates: [],
    candidate_procedures: [
      {
        procedure_id: "proc-1",
        patient_name: "Jean Dupont",
        procedure_date: "2026-04-20",
        billed_amount: 60000,
        is_exact_amount: true,
      },
    ],
    suggested_fund_id: null,
    suggested_fund_name: null,
    ...overrides,
  };
}

/** BAS-116 — a line that already has staged procedure assignments (walked past). */
function makeProcedureAssignedLine(id: string): BankStatementLine {
  return {
    line_id: id,
    credit_line: { date: "2026-04-13", label: "CPAM75", amount: 60000 },
    status: "Partial",
    fund_id: "fund-1",
    assigned_group_ids: [],
    assigned_procedure_ids: ["proc-2"],
    covered_amount: 60000,
    remainder_acknowledged: false,
    candidate_groups: [
      {
        group_id: "group-9",
        fund_id: "fund-1",
        fund_name: "CPAM Paris",
        payment_date: "2026-04-08",
        total_amount: 60000,
        is_exact_amount: true,
      },
    ],
    broadened_candidates: [],
    candidate_procedures: [],
    suggested_fund_id: null,
    suggested_fund_name: null,
  };
}

function makeReconciliation(lines: BankStatementLine[]): BankStatementReconciliation {
  const resolved = lines.filter((l) => l.status === "Matched" || l.status === "Rejected").length;
  return {
    lines,
    resolved_count: resolved,
    needs_correction_count: lines.length - resolved,
  };
}

function renderWizard(
  lines: BankStatementLine[],
  overrides: {
    onApplyCorrection?: (c: unknown) => void;
    onComplete?: () => void;
    onAbandon?: () => void;
    procedureWindowDays?: number;
  } = {},
) {
  return render(
    <ReconciliationWizard
      reconciliation={makeReconciliation(lines)}
      isOpen={true}
      onApplyCorrection={overrides.onApplyCorrection ?? vi.fn()}
      onComplete={overrides.onComplete ?? vi.fn()}
      onAbandon={overrides.onAbandon ?? vi.fn()}
      procedureWindowDays={overrides.procedureWindowDays ?? 90}
      now={NOW}
    />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ReconciliationWizard — BAS-116 settlement-only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("presents the group selector for a line with group candidates (BAS-116)", () => {
    renderWizard([makeNeedsGroupLine("line-ng-1")]);

    expect(document.getElementById("wizard-phase-assign-group")).not.toBeNull();
    expect(document.getElementById("wizard-assign-check-group-1")).not.toBeNull();
  });

  it("presents the procedure selector for a group-less line with procedure candidates (BAS-116 revised — no more walk-past)", () => {
    renderWizard([makeProcedureOnlyLine("line-proc-only")]);

    expect(document.getElementById("wizard-phase-assign-procedure")).not.toBeNull();
    expect(document.getElementById("wizard-assign-check-proc-proc-1")).not.toBeNull();
  });

  it("walks past a line with neither group candidates nor window-filtered procedure candidates", () => {
    const noCandidatesAtAll = makeProcedureOnlyLine("line-none", { candidate_procedures: [] });

    renderWizard([noCandidatesAtAll]);

    expect(document.getElementById("wizard-done")).not.toBeNull();
  });

  it("walks past a line whose only procedure candidate is outside the display window (BAS-118)", () => {
    // 2026-05-01 minus 90 days = 2026-01-31; this candidate is from 2025-12-01.
    const outOfWindow = makeProcedureOnlyLine("line-out-of-window", {
      candidate_procedures: [
        {
          procedure_id: "proc-old",
          patient_name: "Old Patient",
          procedure_date: "2025-12-01",
          billed_amount: 60000,
          is_exact_amount: true,
        },
      ],
    });

    renderWizard([outOfWindow], { procedureWindowDays: 90 });

    expect(document.getElementById("wizard-done")).not.toBeNull();
  });

  it("filters the procedure step's candidates by the display window (BAS-118)", () => {
    const withinWindow = {
      procedure_id: "proc-recent",
      patient_name: "Recent Patient",
      procedure_date: "2026-04-20",
      billed_amount: 30000,
      is_exact_amount: false,
    };
    const outsideWindow = {
      procedure_id: "proc-old",
      patient_name: "Old Patient",
      procedure_date: "2025-12-01",
      billed_amount: 30000,
      is_exact_amount: false,
    };
    const line = makeProcedureOnlyLine("line-mixed", {
      candidate_procedures: [withinWindow, outsideWindow],
    });

    renderWizard([line], { procedureWindowDays: 90 });

    expect(document.getElementById("wizard-assign-check-proc-proc-recent")).not.toBeNull();
    expect(document.getElementById("wizard-assign-check-proc-proc-old")).toBeNull();
  });

  it("walks past a line that already carries assigned procedures, even though it has group candidates (BAS-116)", () => {
    renderWizard([makeProcedureAssignedLine("line-proc-assigned")]);

    expect(document.getElementById("wizard-done")).not.toBeNull();
    expect(document.getElementById("wizard-phase-assign-group")).toBeNull();
  });

  it("still presents an ordinary needs-group line while walking past group-less and procedure-assigned ones", () => {
    const procedureOnly = makeProcedureOnlyLine("line-proc-only", { candidate_procedures: [] });
    const procedureAssigned = makeProcedureAssignedLine("line-proc-assigned");
    const ordinary = makeNeedsGroupLine("line-ng-ordinary");

    renderWizard([procedureOnly, procedureAssigned, ordinary]);

    expect(document.getElementById("wizard-phase-assign-group")).not.toBeNull();
    expect(document.getElementById("wizard-assign-check-group-1")).not.toBeNull();
  });

  it("submits an AssignGroups correction when the group step is applied (BAS-102)", async () => {
    const user = userEvent.setup();
    const onApplyCorrection = vi.fn();

    renderWizard([makeNeedsGroupLine("line-ng-1")], { onApplyCorrection });

    const check = document.getElementById("wizard-assign-check-group-1");
    if (!check) throw new Error("candidate checkbox missing");
    await user.click(check);

    const applyBtn = document.getElementById("wizard-apply-step");
    if (!applyBtn) throw new Error("apply button missing");
    await user.click(applyBtn);

    expect(onApplyCorrection).toHaveBeenCalledWith({
      type: "AssignGroups",
      line_id: "line-ng-1",
      group_ids: ["group-1"],
    });
  });

  it("submits an AssignProcedures correction when the procedure step is applied (BAS-116/113)", async () => {
    const user = userEvent.setup();
    const onApplyCorrection = vi.fn();

    renderWizard([makeProcedureOnlyLine("line-proc-only")], { onApplyCorrection });

    const check = document.getElementById("wizard-assign-check-proc-proc-1");
    if (!check) throw new Error("candidate checkbox missing");
    await user.click(check);

    const applyBtn = document.getElementById("wizard-apply-step");
    if (!applyBtn) throw new Error("apply button missing");
    await user.click(applyBtn);

    expect(onApplyCorrection).toHaveBeenCalledWith({
      type: "AssignProcedures",
      line_id: "line-proc-only",
      procedure_ids: ["proc-1"],
    });
  });

  it("disables apply until a selection is made on the procedure step", () => {
    renderWizard([makeProcedureOnlyLine("line-proc-only")]);

    const applyBtn = document.getElementById("wizard-apply-step") as HTMLButtonElement | null;
    expect(applyBtn?.disabled).toBe(true);
  });

  it("skips a step without applying a correction (BAS-101)", async () => {
    const user = userEvent.setup();
    const onApplyCorrection = vi.fn();

    renderWizard([makeNeedsGroupLine("line-ng-1")], { onApplyCorrection });

    const skipBtn = document.getElementById("wizard-skip-step");
    if (!skipBtn) throw new Error("skip button missing");
    await user.click(skipBtn);

    expect(onApplyCorrection).not.toHaveBeenCalled();
    expect(document.getElementById("wizard-done")).not.toBeNull();
  });

  it("calls onAbandon when the abandon button is clicked mid-wizard (BAS-103)", async () => {
    const user = userEvent.setup();
    const onAbandon = vi.fn();

    renderWizard([makeNeedsGroupLine("line-ng-1")], { onAbandon });

    const abandonBtn = document.getElementById("wizard-abandon");
    if (!abandonBtn) throw new Error("abandon button missing");
    await user.click(abandonBtn);

    expect(onAbandon).toHaveBeenCalledTimes(1);
  });

  it("calls onComplete (never validate) when the queue is empty from the start (BAS-103)", async () => {
    const onComplete = vi.fn();
    const matchedLine: BankStatementLine = {
      line_id: "line-matched",
      credit_line: { date: "2026-04-10", label: "CPAM75", amount: 150000 },
      status: "Matched",
      fund_id: "fund-1",
      assigned_group_ids: ["group-1"],
      assigned_procedure_ids: [],
      covered_amount: 150000,
      remainder_acknowledged: false,
      candidate_groups: [],
      broadened_candidates: [],
      candidate_procedures: [],
      suggested_fund_id: null,
      suggested_fund_name: null,
    };

    renderWizard([matchedLine], { onComplete });

    const doneBtn = document.getElementById("wizard-done");
    if (!doneBtn) throw new Error("wizard done button missing");
    await userEvent.click(doneBtn);

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  // BAS-110 — every step (group or procedure) mounts the correction context header.
  it("mounts the correction context header for both a group step and a procedure step (BAS-110)", () => {
    const { unmount } = renderWizard([makeNeedsGroupLine("line-ng-1")]);
    expect(document.getElementById("wizard-step-context")?.textContent).toContain("CPAM75");
    unmount();

    renderWizard([makeProcedureOnlyLine("line-proc-only")]);
    expect(document.getElementById("wizard-step-context")?.textContent).toContain("RATP");
  });

  // BAS-101 — the settlement-only queue no longer has a link-fund phase at all.
  it("never renders a link-fund step or fund select (BAS-116 — no link phase)", () => {
    renderWizard([makeNeedsGroupLine("line-ng-1"), makeProcedureOnlyLine("line-proc-only")]);

    expect(document.getElementById("wizard-phase-link-fund")).toBeNull();
    expect(document.getElementById("wizard-fund-select")).toBeNull();
    expect(document.getElementById("wizard-reject-step")).toBeNull();
  });
});
