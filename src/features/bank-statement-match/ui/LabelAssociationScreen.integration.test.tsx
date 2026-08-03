/**
 * RTL component integration tests — LabelAssociationScreen (BAS-120–121).
 *
 * Screen 1 of the two-screen flow (BAS-120): one row per distinct label,
 * ordered by first occurrence, replacing the removed per-line LinkFundModal.
 * Each row: raw label, count + total amount, inline fund select (pre-filled
 * from the saved mapping, empty + suggestion helper for an unknown label,
 * BAS-120B), a status chip, and a single state-dependent action
 * (Ignorer/Rétablir, BAS-120C). « Continuer » gates on every label being
 * decided (BAS-121); destructive re-link/ignore on a label whose lines carry
 * assigned settlement items asks for inline confirmation first (BAS-120E).
 *
 * Design pins (no contract/plan authority beyond the task description —
 * documented for the implementer):
 *   - Props: reconciliation, corrections, isBusy, errorText,
 *     onApplyCorrection (Promise<boolean>), onRevertCorrection(index),
 *     onContinue, onCancel.
 *   - Stable ids: label-assoc-row-{label}, label-assoc-select-{label},
 *     label-assoc-ignore-{label} (single state-dependent action),
 *     label-assoc-suggestion-{label}, label-assoc-chip-{label},
 *     label-assoc-confirm-{label} / label-assoc-confirm-cancel-{label}
 *     (BAS-120E inline guard), label-assoc-continue, label-assoc-cancel.
 *
 * Mocks the gateway boundary is not needed here (pure props component); the
 * fund cache store is seeded directly (test_convention.md § Seeding Zustand
 * store). i18n mocked pass-through. Stable id selectors (F25).
 *
 * These tests fail until ui/LabelAssociationScreen.tsx is created.
 */

import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BankStatementCorrection, BankStatementLine, Fund } from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
    i18n: { language: "fr" },
  }),
}));

import { LabelAssociationScreen } from "./LabelAssociationScreen";

const MOCK_FUNDS: Fund[] = [
  { id: "fund-1", fund_identifier: "75", name: "CPAM 75", temp_id: null },
  { id: "fund-2", fund_identifier: "93", name: "Mutuelle Générale", temp_id: null },
];

function makeLine(overrides: Partial<BankStatementLine> = {}): BankStatementLine {
  return {
    line_id: "line-1",
    credit_line: { date: "2026-04-10", label: "CPAM75", amount: 150000 },
    status: "NeedsLink",
    fund_id: null,
    assigned_group_ids: [],
    assigned_procedure_ids: [],
    covered_amount: 0,
    remainder_acknowledged: false,
    candidate_groups: [],
    broadened_candidates: [],
    candidate_procedures: [],
    suggested_fund_id: null,
    suggested_fund_name: null,
    ...overrides,
  };
}

function makeReconciliation(lines: BankStatementLine[]) {
  return {
    lines,
    resolved_count: 0,
    needs_correction_count: lines.length,
  };
}

function renderScreen(
  lines: BankStatementLine[],
  overrides: {
    corrections?: BankStatementCorrection[];
    onApplyCorrection?: (c: BankStatementCorrection) => Promise<boolean>;
    onRevertCorrection?: (i: number) => Promise<void>;
    onContinue?: () => void;
    onCancel?: () => void;
    isBusy?: boolean;
  } = {},
) {
  return render(
    <LabelAssociationScreen
      reconciliation={makeReconciliation(lines)}
      corrections={overrides.corrections ?? []}
      isBusy={overrides.isBusy ?? false}
      onApplyCorrection={overrides.onApplyCorrection ?? vi.fn().mockResolvedValue(true)}
      onRevertCorrection={overrides.onRevertCorrection ?? vi.fn().mockResolvedValue(undefined)}
      onContinue={overrides.onContinue ?? vi.fn()}
      onCancel={overrides.onCancel ?? vi.fn()}
    />,
  );
}

describe("LabelAssociationScreen — BAS-120–121", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: MOCK_FUNDS });
  });

  // -------------------------------------------------------------------------
  // BAS-120 — one row per distinct label, first-occurrence order
  // -------------------------------------------------------------------------

  it("renders one row per distinct label, ordered by first occurrence", () => {
    const lines = [
      makeLine({ line_id: "l1", credit_line: { date: "2026-04-10", label: "MGEN", amount: 1000 } }),
      makeLine({ line_id: "l2", credit_line: { date: "2026-04-11", label: "CPAM75", amount: 2000 } }),
      makeLine({ line_id: "l3", credit_line: { date: "2026-04-12", label: "MGEN", amount: 500 } }),
    ];

    renderScreen(lines);

    const rows = document.querySelectorAll("[id^='label-assoc-row-']");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.id).toBe("label-assoc-row-MGEN");
    expect(rows[1]?.id).toBe("label-assoc-row-CPAM75");
  });

  it("shows the credit-line count and total amount for the label", () => {
    const lines = [
      makeLine({ line_id: "l1", credit_line: { date: "2026-04-10", label: "MGEN", amount: 1000 } }),
      makeLine({ line_id: "l2", credit_line: { date: "2026-04-11", label: "MGEN", amount: 500 } }),
    ];

    renderScreen(lines);

    const row = document.getElementById("label-assoc-row-MGEN");
    expect(row?.textContent).toMatch(/2/);
  });

  // -------------------------------------------------------------------------
  // BAS-120B — select semantics
  // -------------------------------------------------------------------------

  it("pre-fills the select from the saved/resolved fund mapping", () => {
    const lines = [
      makeLine({
        status: "Matched",
        fund_id: "fund-1",
        credit_line: { date: "2026-04-10", label: "CPAM75", amount: 1000 },
      }),
    ];

    renderScreen(lines);

    const select = document.getElementById("label-assoc-select-CPAM75") as HTMLSelectElement | null;
    expect(select?.value).toBe("fund-1");
  });

  it("leaves the select empty and shows the suggestion helper text for an unknown label (BAS-032/033/036)", () => {
    const lines = [
      makeLine({
        credit_line: { date: "2026-04-10", label: "MUTGEN", amount: 1000 },
        suggested_fund_id: "fund-2",
        suggested_fund_name: "Mutuelle Générale",
      }),
    ];

    renderScreen(lines);

    const select = document.getElementById("label-assoc-select-MUTGEN") as HTMLSelectElement | null;
    expect(select?.value).toBe("");
    const suggestion = document.getElementById("label-assoc-suggestion-MUTGEN");
    expect(suggestion?.textContent).toContain("Mutuelle Générale");
  });

  it("applies a LinkFund/Fund correction when a fund is chosen for an undecided label with no assigned items", async () => {
    const onApplyCorrection = vi.fn().mockResolvedValue(true);
    const lines = [
      makeLine({ credit_line: { date: "2026-04-10", label: "CPAM75", amount: 1000 } }),
    ];

    renderScreen(lines, { onApplyCorrection });

    const select = document.getElementById("label-assoc-select-CPAM75");
    if (!select) throw new Error("fund select missing");
    await userEvent.selectOptions(select, "fund-1");

    expect(onApplyCorrection).toHaveBeenCalledWith({
      type: "LinkFund",
      bank_label: "CPAM75",
      assignment: { type: "Fund", fund_id: "fund-1" },
    });
  });

  // -------------------------------------------------------------------------
  // BAS-120A/C — chip + single state-dependent action
  // -------------------------------------------------------------------------

  it("shows the 'to associate' chip and an Ignorer action for an undecided label", () => {
    const lines = [makeLine({ credit_line: { date: "2026-04-10", label: "CPAM75", amount: 1000 } })];

    renderScreen(lines);

    const chip = document.getElementById("label-assoc-chip-CPAM75");
    expect(chip?.textContent).toBe("bank:label_association.chip.todo");
    const action = document.getElementById("label-assoc-ignore-CPAM75");
    expect(action?.textContent).toBe("bank:label_association.ignore");
  });

  it("shows the 'associated' chip for a linked label", () => {
    const lines = [
      makeLine({
        status: "Matched",
        fund_id: "fund-1",
        credit_line: { date: "2026-04-10", label: "CPAM75", amount: 1000 },
      }),
    ];

    renderScreen(lines);

    expect(document.getElementById("label-assoc-chip-CPAM75")?.textContent).toBe(
      "bank:label_association.chip.linked",
    );
  });

  it("shows the 'ignored' chip and a Rétablir action, with the select disabled, for a rejected label", () => {
    const lines = [
      makeLine({
        status: "Rejected",
        fund_id: null,
        credit_line: { date: "2026-04-10", label: "SALAIRE", amount: 1000 },
      }),
    ];

    renderScreen(lines);

    expect(document.getElementById("label-assoc-chip-SALAIRE")?.textContent).toBe(
      "bank:label_association.chip.ignored",
    );
    const action = document.getElementById("label-assoc-ignore-SALAIRE");
    expect(action?.textContent).toBe("bank:label_association.restore");
    const select = document.getElementById("label-assoc-select-SALAIRE") as HTMLSelectElement | null;
    expect(select?.disabled).toBe(true);
  });

  it("applies LinkFund/Rejected directly when Ignorer is clicked on a label with no assigned items", async () => {
    const onApplyCorrection = vi.fn().mockResolvedValue(true);
    const lines = [makeLine({ credit_line: { date: "2026-04-10", label: "CPAM75", amount: 1000 } })];

    renderScreen(lines, { onApplyCorrection });

    const ignoreBtn = document.getElementById("label-assoc-ignore-CPAM75");
    if (!ignoreBtn) throw new Error("ignore button missing");
    await userEvent.click(ignoreBtn);

    expect(onApplyCorrection).toHaveBeenCalledWith({
      type: "LinkFund",
      bank_label: "CPAM75",
      assignment: { type: "Rejected" },
    });
    // No confirmation control rendered — nothing was staged for this label.
    expect(document.getElementById("label-assoc-confirm-CPAM75")).toBeNull();
  });

  // -------------------------------------------------------------------------
  // BAS-120E — destructive re-link/ignore guard
  // -------------------------------------------------------------------------

  it("asks for inline confirmation before ignoring a label whose lines carry assigned settlement items", async () => {
    const onApplyCorrection = vi.fn().mockResolvedValue(true);
    const lines = [
      makeLine({
        status: "Matched",
        fund_id: "fund-1",
        assigned_group_ids: ["group-1"],
        credit_line: { date: "2026-04-10", label: "CPAM75", amount: 1000 },
      }),
    ];

    renderScreen(lines, { onApplyCorrection });

    const ignoreBtn = document.getElementById("label-assoc-ignore-CPAM75");
    if (!ignoreBtn) throw new Error("ignore button missing");
    await userEvent.click(ignoreBtn);

    // Not applied yet — an inline confirmation control appears instead.
    expect(onApplyCorrection).not.toHaveBeenCalled();
    const confirm = document.getElementById("label-assoc-confirm-CPAM75");
    expect(confirm).not.toBeNull();

    if (!confirm) throw new Error("confirm control missing");
    await userEvent.click(confirm);

    expect(onApplyCorrection).toHaveBeenCalledWith({
      type: "LinkFund",
      bank_label: "CPAM75",
      assignment: { type: "Rejected" },
    });
  });

  it("does not apply anything when the BAS-120E confirmation is cancelled", async () => {
    const onApplyCorrection = vi.fn().mockResolvedValue(true);
    const lines = [
      makeLine({
        status: "Matched",
        fund_id: "fund-1",
        assigned_procedure_ids: ["proc-1"],
        credit_line: { date: "2026-04-10", label: "RATP", amount: 1000 },
      }),
    ];

    renderScreen(lines, { onApplyCorrection });

    const ignoreBtn = document.getElementById("label-assoc-ignore-RATP");
    if (!ignoreBtn) throw new Error("ignore button missing");
    await userEvent.click(ignoreBtn);

    const cancelConfirm = document.getElementById("label-assoc-confirm-cancel-RATP");
    if (!cancelConfirm) throw new Error("confirm-cancel control missing");
    await userEvent.click(cancelConfirm);

    expect(onApplyCorrection).not.toHaveBeenCalled();
    expect(document.getElementById("label-assoc-confirm-RATP")).toBeNull();
  });

  // -------------------------------------------------------------------------
  // BAS-120C — Rétablir: in-session revert vs saved-rejected unlock
  // -------------------------------------------------------------------------

  it("reverts the in-session LinkFund/Rejected correction when Rétablir is clicked", async () => {
    const onRevertCorrection = vi.fn().mockResolvedValue(undefined);
    const lines = [
      makeLine({
        status: "Rejected",
        fund_id: null,
        credit_line: { date: "2026-04-10", label: "SALAIRE", amount: 1000 },
      }),
    ];
    const corrections: BankStatementCorrection[] = [
      { type: "LinkFund", bank_label: "SALAIRE", assignment: { type: "Rejected" } },
    ];

    renderScreen(lines, { corrections, onRevertCorrection });

    const restoreBtn = document.getElementById("label-assoc-ignore-SALAIRE");
    if (!restoreBtn) throw new Error("restore button missing");
    await userEvent.click(restoreBtn);

    expect(onRevertCorrection).toHaveBeenCalledWith(0);
  });

  it("unlocks the select without reverting anything when Rétablir targets a SAVED rejection (no correction to revert)", async () => {
    const onRevertCorrection = vi.fn().mockResolvedValue(undefined);
    const lines = [
      makeLine({
        status: "Rejected",
        fund_id: null,
        credit_line: { date: "2026-04-10", label: "SALAIRE", amount: 1000 },
      }),
    ];

    renderScreen(lines, { corrections: [], onRevertCorrection });

    const select = document.getElementById("label-assoc-select-SALAIRE") as HTMLSelectElement | null;
    expect(select?.disabled).toBe(true);

    const restoreBtn = document.getElementById("label-assoc-ignore-SALAIRE");
    if (!restoreBtn) throw new Error("restore button missing");
    await userEvent.click(restoreBtn);

    expect(onRevertCorrection).not.toHaveBeenCalled();
    const unlockedSelect = document.getElementById(
      "label-assoc-select-SALAIRE",
    ) as HTMLSelectElement | null;
    expect(unlockedSelect?.disabled).toBe(false);
  });

  // -------------------------------------------------------------------------
  // BAS-121 — Continuer gate + Annuler
  // -------------------------------------------------------------------------

  it("disables Continuer while at least one label is undecided", () => {
    const lines = [
      makeLine({
        status: "Matched",
        fund_id: "fund-1",
        credit_line: { date: "2026-04-10", label: "CPAM75", amount: 1000 },
      }),
      makeLine({
        credit_line: { date: "2026-04-11", label: "MGEN", amount: 500 },
      }),
    ];

    renderScreen(lines);

    const continueBtn = document.getElementById("label-assoc-continue") as HTMLButtonElement | null;
    expect(continueBtn).not.toBeNull();
    expect(continueBtn?.disabled).toBe(true);
  });

  it("enables Continuer once every label is linked or ignored", () => {
    const lines = [
      makeLine({
        status: "Matched",
        fund_id: "fund-1",
        credit_line: { date: "2026-04-10", label: "CPAM75", amount: 1000 },
      }),
      makeLine({
        status: "Rejected",
        fund_id: null,
        credit_line: { date: "2026-04-11", label: "SALAIRE", amount: 500 },
      }),
    ];

    renderScreen(lines);

    const continueBtn = document.getElementById("label-assoc-continue") as HTMLButtonElement | null;
    expect(continueBtn?.disabled).toBe(false);
  });

  it("calls onContinue when Continuer is clicked", async () => {
    const onContinue = vi.fn();
    const lines = [
      makeLine({
        status: "Matched",
        fund_id: "fund-1",
        credit_line: { date: "2026-04-10", label: "CPAM75", amount: 1000 },
      }),
    ];

    renderScreen(lines, { onContinue });

    const continueBtn = document.getElementById("label-assoc-continue");
    if (!continueBtn) throw new Error("continue button missing");
    await userEvent.click(continueBtn);

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Annuler is clicked, abandoning the import", async () => {
    const onCancel = vi.fn();
    const lines = [makeLine({ credit_line: { date: "2026-04-10", label: "CPAM75", amount: 1000 } })];

    renderScreen(lines, { onCancel });

    const cancelBtn = document.getElementById("label-assoc-cancel");
    if (!cancelBtn) throw new Error("cancel button missing");
    await userEvent.click(cancelBtn);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables the fund selects and action buttons while isBusy", () => {
    const lines = [makeLine({ credit_line: { date: "2026-04-10", label: "CPAM75", amount: 1000 } })];

    renderScreen(lines, { isBusy: true });

    const select = document.getElementById("label-assoc-select-CPAM75") as HTMLSelectElement | null;
    const ignoreBtn = document.getElementById("label-assoc-ignore-CPAM75") as HTMLButtonElement | null;
    expect(select?.disabled).toBe(true);
    expect(ignoreBtn?.disabled).toBe(true);
  });
});
