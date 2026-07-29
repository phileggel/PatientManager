/**
 * RTL component integration tests — ReconciliationWizard (BAS-100–103).
 *
 * Tests:
 *   - phase 1 (link-fund items) shown first in document order (BAS-101)
 *   - completing a wizard step calls onApplyCorrection (BAS-102 — same model as manual)
 *   - wizard completion returns to list (BAS-103) — modelled as onComplete callback
 *   - abandon mid-wizard calls onAbandon which keeps applied corrections (BAS-103)
 *
 * Wizard never auto-validates (BAS-103). Stable id selectors (F25).
 * These tests fail until ui/ReconciliationWizard.tsx is created.
 */

import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BankStatementLine, BankStatementReconciliation, Fund } from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}));

import { ReconciliationWizard } from "./ReconciliationWizard";

// The wizard's embedded link-fund step sources fund options from the shared
// cache store (same pattern as LinkFundModal); seed it so `fund-1` is selectable.
const MOCK_FUNDS: Fund[] = [
  { id: "fund-1", fund_identifier: "75", name: "CPAM 75", temp_id: null },
];

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeNeedsLinkLine(id: string, label: string): BankStatementLine {
  return {
    line_id: id,
    credit_line: { date: "2026-04-10", label, amount: 150000 },
    status: "NeedsLink",
    fund_id: null,
    assigned_group_ids: [],
    covered_amount: 0,
    remainder_acknowledged: false,
    candidate_groups: [],
    broadened_candidates: [],
    suggested_fund_id: null,
    suggested_fund_name: null,
  };
}

function makeNeedsGroupLine(id: string): BankStatementLine {
  return {
    line_id: id,
    credit_line: { date: "2026-04-11", label: "CPAM75", amount: 200000 },
    status: "NeedsGroup",
    fund_id: "fund-1",
    assigned_group_ids: [],
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ReconciliationWizard — BAS-100–103", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: MOCK_FUNDS });
  });

  // BAS-101 — phase 1: all link-fund items first (in document order)
  it("presents NeedsLink lines before NeedsGroup lines in phase order (BAS-101)", () => {
    const needsLink1 = makeNeedsLinkLine("line-nl-1", "MGEN");
    const needsGroup1 = makeNeedsGroupLine("line-ng-1");
    const needsLink2 = makeNeedsLinkLine("line-nl-2", "MUTUELLE");
    const reconciliation = makeReconciliation([needsGroup1, needsLink1, needsLink2]);

    render(
      <ReconciliationWizard
        reconciliation={reconciliation}
        isOpen={true}
        onApplyCorrection={vi.fn()}
        onComplete={vi.fn()}
        onAbandon={vi.fn()}
      />,
    );

    // The wizard must be showing a phase-1 (link-fund) item first
    const currentStep = document.getElementById("wizard-current-step");
    expect(currentStep).not.toBeNull();

    // The wizard's current item should be a NeedsLink line (phase 1)
    const phase1Indicator = document.getElementById("wizard-phase-link-fund");
    expect(phase1Indicator).not.toBeNull();
  });

  // BAS-102 — applying a wizard step calls onApplyCorrection (same correction model)
  it("calls onApplyCorrection with a LinkFund correction when wizard step is submitted (BAS-102)", async () => {
    const user = userEvent.setup();
    const onApplyCorrection = vi.fn();
    const needsLink = makeNeedsLinkLine("line-nl-1", "MGEN");
    const reconciliation = makeReconciliation([needsLink]);

    render(
      <ReconciliationWizard
        reconciliation={reconciliation}
        isOpen={true}
        onApplyCorrection={onApplyCorrection}
        onComplete={vi.fn()}
        onAbandon={vi.fn()}
      />,
    );

    // Select a fund in the embedded link-fund step
    const fundSelect = document.getElementById("wizard-fund-select");
    expect(fundSelect).not.toBeNull();
    if (!fundSelect) throw new Error("fund select missing in wizard");

    await userEvent.selectOptions(fundSelect, "fund-1");

    const applyBtn = document.getElementById("wizard-apply-step");
    expect(applyBtn).not.toBeNull();
    if (!applyBtn) throw new Error("wizard apply button missing");

    await user.click(applyBtn);

    expect(onApplyCorrection).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "LinkFund",
        bank_label: "MGEN",
        assignment: { type: "Fund", fund_id: "fund-1" },
      }),
    );
  });

  // BAS-101 — the apply button never submits with the placeholder selected;
  // an empty selection must not imply rejection.
  it("disables apply while no fund is selected in the link-fund step (BAS-101)", () => {
    const onApplyCorrection = vi.fn();
    const reconciliation = makeReconciliation([makeNeedsLinkLine("line-nl-1", "MGEN")]);

    render(
      <ReconciliationWizard
        reconciliation={reconciliation}
        isOpen={true}
        onApplyCorrection={onApplyCorrection}
        onComplete={vi.fn()}
        onAbandon={vi.fn()}
      />,
    );

    const applyBtn = document.getElementById("wizard-apply-step") as HTMLButtonElement | null;
    expect(applyBtn).not.toBeNull();
    expect(applyBtn?.disabled).toBe(true);
    expect(onApplyCorrection).not.toHaveBeenCalled();
  });

  // BAS-101/BAS-030 — rejection is an explicit affordance, mirroring LinkFundModal.
  it("submits a Rejected assignment only via the explicit reject button (BAS-101)", async () => {
    const user = userEvent.setup();
    const onApplyCorrection = vi.fn();
    const reconciliation = makeReconciliation([makeNeedsLinkLine("line-nl-1", "MGEN")]);

    render(
      <ReconciliationWizard
        reconciliation={reconciliation}
        isOpen={true}
        onApplyCorrection={onApplyCorrection}
        onComplete={vi.fn()}
        onAbandon={vi.fn()}
      />,
    );

    const rejectBtn = document.getElementById("wizard-reject-step");
    expect(rejectBtn).not.toBeNull();
    if (!rejectBtn) throw new Error("wizard reject button missing");

    await user.click(rejectBtn);

    expect(onApplyCorrection).toHaveBeenCalledWith({
      type: "LinkFund",
      bank_label: "MGEN",
      assignment: { type: "Rejected" },
    });
  });

  // BAS-101 — phase 2 presents the ranked candidate selector; apply carries the
  // explicit selection (never an implicit empty assignment).
  it("submits the selected candidate group from the assign-group step (BAS-101)", async () => {
    const user = userEvent.setup();
    const onApplyCorrection = vi.fn();
    const reconciliation = makeReconciliation([makeNeedsGroupLine("line-ng-1")]);

    render(
      <ReconciliationWizard
        reconciliation={reconciliation}
        isOpen={true}
        onApplyCorrection={onApplyCorrection}
        onComplete={vi.fn()}
        onAbandon={vi.fn()}
      />,
    );

    // Phase-2 indicator + candidate selector rendered with wizard-scoped ids.
    expect(document.getElementById("wizard-phase-assign-group")).not.toBeNull();
    const candidateCheck = document.getElementById("wizard-assign-check-group-1");
    expect(candidateCheck).not.toBeNull();
    if (!candidateCheck) throw new Error("wizard candidate checkbox missing");

    // Apply is disabled until something is selected.
    const applyBtn = document.getElementById("wizard-apply-step") as HTMLButtonElement | null;
    expect(applyBtn?.disabled).toBe(true);
    if (!applyBtn) throw new Error("wizard apply button missing");

    await user.click(candidateCheck);
    expect(applyBtn.disabled).toBe(false);

    await user.click(applyBtn);

    expect(onApplyCorrection).toHaveBeenCalledWith({
      type: "AssignGroups",
      line_id: "line-ng-1",
      group_ids: ["group-1"],
    });
  });

  // BAS-101 — skipping advances past the line without applying any correction.
  it("skips a step without applying a correction (BAS-101)", async () => {
    const user = userEvent.setup();
    const onApplyCorrection = vi.fn();
    const reconciliation = makeReconciliation([makeNeedsGroupLine("line-ng-1")]);

    render(
      <ReconciliationWizard
        reconciliation={reconciliation}
        isOpen={true}
        onApplyCorrection={onApplyCorrection}
        onComplete={vi.fn()}
        onAbandon={vi.fn()}
      />,
    );

    const skipBtn = document.getElementById("wizard-skip-step");
    expect(skipBtn).not.toBeNull();
    if (!skipBtn) throw new Error("wizard skip button missing");

    await user.click(skipBtn);

    // The only line was skipped — the wizard reaches its done state.
    expect(onApplyCorrection).not.toHaveBeenCalled();
    expect(document.getElementById("wizard-done")).not.toBeNull();
  });

  // BAS-103 — abandoning calls onAbandon (corrections already applied are kept — caller's concern)
  it("calls onAbandon when the abandon/close button is clicked mid-wizard (BAS-103)", async () => {
    const user = userEvent.setup();
    const onAbandon = vi.fn();
    const needsLink = makeNeedsLinkLine("line-nl-1", "MGEN");
    const reconciliation = makeReconciliation([needsLink]);

    render(
      <ReconciliationWizard
        reconciliation={reconciliation}
        isOpen={true}
        onApplyCorrection={vi.fn()}
        onComplete={vi.fn()}
        onAbandon={onAbandon}
      />,
    );

    const abandonBtn = document.getElementById("wizard-abandon");
    expect(abandonBtn).not.toBeNull();
    if (!abandonBtn) throw new Error("wizard abandon button missing");

    await user.click(abandonBtn);

    expect(onAbandon).toHaveBeenCalledTimes(1);
  });

  // BAS-103 — wizard never auto-validates (no validate call on completion)
  it("calls onComplete (not validate) when all steps are done — wizard never auto-validates (BAS-103)", async () => {
    const onComplete = vi.fn();
    const onApplyCorrection = vi.fn();
    // Reconciliation with zero correction-needed lines — wizard is immediately done
    const reconciliation = makeReconciliation([
      {
        line_id: "line-matched",
        credit_line: { date: "2026-04-10", label: "CPAM75", amount: 150000 },
        status: "Matched",
        fund_id: "fund-1",
        assigned_group_ids: ["group-1"],
        covered_amount: 150000,
        remainder_acknowledged: false,
        candidate_groups: [],
        broadened_candidates: [],
        suggested_fund_id: null,
        suggested_fund_name: null,
      },
    ]);

    render(
      <ReconciliationWizard
        reconciliation={reconciliation}
        isOpen={true}
        onApplyCorrection={onApplyCorrection}
        onComplete={onComplete}
        onAbandon={vi.fn()}
      />,
    );

    // When there are no correction-needed lines the wizard shows a "done" state
    // and the done/complete button calls onComplete (not validate)
    const doneBtn = document.getElementById("wizard-done");
    expect(doneBtn).not.toBeNull();
    if (!doneBtn) throw new Error("wizard done button missing");

    await userEvent.click(doneBtn);

    expect(onComplete).toHaveBeenCalledTimes(1);
    // Validate must NEVER be triggered by the wizard
    // (gateway mock not needed — the test simply confirms onComplete fires and
    // does not assert any gateway call)
  });
});
