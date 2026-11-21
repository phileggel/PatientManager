/**
 * RTL component integration tests — ReconciliationView (BAS-122/123 two-screen flow).
 *
 * BAS-122 rework: ReconciliationView is now a two-screen state machine.
 *   Screen 1 (labels)     — LabelAssociationScreen (BAS-120–121); « Continuer »
 *                           advances once every label is linked or ignored.
 *   Screen 2 (settlement) — ReconciliationList restricted to LINKED labels'
 *                           lines only (NeedsLink/Rejected lines never render
 *                           here); « Retour aux libellés » returns to screen 1
 *                           with the draft intact (one correction model,
 *                           BAS-102/120D); « Valider » gates on every visible
 *                           line being Matched (BAS-123), vacuously satisfied
 *                           when the settlement screen has zero visible lines.
 *
 * The per-line link-fund correction modal is REMOVED (BAS-122B) — a NeedsLink
 * line can never reach screen 2 (the BAS-121 gate blocks it), so
 * AssignGroupsModal is the only per-line correction dialog left here.
 *
 * Mocks the gateway at the feature boundary (F3/F27). Stable id selectors
 * (F25). i18n mocked pass-through.
 *
 * These tests fail until ui/ReconciliationView.tsx is reworked for the
 * two-screen flow (BAS-122) and ui/LabelAssociationScreen.tsx exists (BAS-120).
 */

import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BankStatementLine,
  BankStatementParseResult,
  BankStatementReconciliation,
} from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";

// ---------------------------------------------------------------------------
// Mock gateway boundary (F3). Must be before component + hook imports.
// ---------------------------------------------------------------------------

vi.mock("../gateway", () => ({
  parseBankStatement: vi.fn(),
  resolveBankAccountFromIban: vi.fn(),
  createBankAccount: vi.fn(),
  computeBankStatementReconciliation: vi.fn(),
  validateBankStatementReconciliation: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
    i18n: { language: "fr" },
  }),
}));

import * as gateway from "../gateway";
import { ReconciliationView } from "./ReconciliationView";

const mockCompute = vi.mocked(gateway.computeBankStatementReconciliation);
const mockValidate = vi.mocked(gateway.validateBankStatementReconciliation);

// ---------------------------------------------------------------------------
// Fixtures — stable references (F19 / test-rules.md)
// ---------------------------------------------------------------------------

const BANK_ACCOUNT_ID = "acc-1";

const PARSE_RESULT: BankStatementParseResult = {
  iban: "FR7612345678901234567890189",
  period: "du 01/04/2026 au 30/04/2026",
  credit_lines: [
    { date: "2026-04-10", label: "CPAM75", amount: 150000 },
    { date: "2026-04-11", label: "MGEN", amount: 75000 },
  ],
  total_credits: 225000,
  unparsed_count: 0,
};

function makeLine(overrides: Partial<BankStatementLine>): BankStatementLine {
  return {
    line_id: "line-1",
    credit_line: { date: "2026-04-10", label: "CPAM75", amount: 150000 },
    status: "Matched",
    fund_id: "fund-1",
    assigned_group_ids: ["group-1"],
    assigned_procedure_ids: [],
    covered_amount: 150000,
    remainder_acknowledged: false,
    candidate_groups: [],
    candidate_procedures: [],
    suggested_fund_id: null,
    suggested_fund_name: null,
    ...overrides,
  };
}

function makeReconciliation(
  lines: BankStatementLine[],
  overrides: Partial<BankStatementReconciliation> = {},
): BankStatementReconciliation {
  return {
    lines,
    resolved_count: lines.filter((l) => l.status === "Matched" || l.status === "Rejected").length,
    needs_correction_count: lines.filter((l) => l.status !== "Matched" && l.status !== "Rejected")
      .length,
    recap: {
      lines_taken_count: 0,
      total_amount: 0,
      partly_paid_lines: [],
      period_start: null,
      period_end: null,
      period_month: null,
    },
    ...overrides,
  };
}

// All fund_id-carrying fixtures below have a DECIDED label (fund_id set),
// so the BAS-121 gate on screen 1 is satisfied for single-line reconciliations
// built from them without any extra setup.

const NEEDS_GROUP_LINE = makeLine({
  line_id: "line-needs-group",
  status: "NeedsGroup",
  fund_id: "fund-1",
  assigned_group_ids: [],
  covered_amount: 0,
  candidate_groups: [
    {
      group_id: "group-1",
      fund_id: "fund-1",
      fund_name: "CPAM Paris",
      payment_date: "2026-04-08",
      total_amount: 150000,
      is_exact_amount: true,
    },
  ],
});

const MATCHED_LINE = makeLine({ line_id: "line-matched", status: "Matched" });

const REJECTED_LINE = makeLine({
  line_id: "line-rejected",
  status: "Rejected",
  fund_id: null,
  assigned_group_ids: [],
  covered_amount: 0,
  credit_line: { date: "2026-04-11", label: "MGEN", amount: 75000 },
});

const MOCK_FUNDS = [{ id: "fund-1", fund_identifier: "75", name: "CPAM 75", temp_id: null }];

/** Clicks screen 1's Continuer button once it is present and enabled. */
async function goToSettlement(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => {
    const btn = document.getElementById(
      "bank-statement-label-association-continue",
    ) as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn?.disabled).toBe(false);
  });
  await user.click(document.getElementById("bank-statement-label-association-continue")!);
  await waitFor(() => {
    expect(document.getElementById("reconciliation-list")).not.toBeNull();
  });
}

/** From the matching, clicks « Récapitulatif › » once it is enabled. */
async function goToRecap(user: ReturnType<typeof userEvent.setup>) {
  await goToSettlement(user);
  await user.click(document.getElementById("reconciliation-to-recap")!);
  await waitFor(() => {
    expect(document.getElementById("recap-figures")).not.toBeNull();
  });
}

function renderView(onClose = vi.fn(), onCancel = vi.fn(), onWorkChange = vi.fn()) {
  return render(
    <ReconciliationView
      bankAccountId={BANK_ACCOUNT_ID}
      parseResult={PARSE_RESULT}
      onClose={onClose}
      onCancel={onCancel}
      onWorkChange={onWorkChange}
    />,
  );
}

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe("ReconciliationView — loading state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: MOCK_FUNDS });
  });

  it("renders the loading indicator while reconciliation has not yet computed", async () => {
    mockCompute.mockReturnValue(new Promise(() => {}));

    renderView();

    await waitFor(() => {
      expect(document.getElementById("bank-statement-label-association-continue")).toBeNull();
      expect(document.getElementById("reconciliation-list")).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Two-screen state machine (BAS-122)
// ---------------------------------------------------------------------------

describe("ReconciliationView — two-screen state machine (BAS-122)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: MOCK_FUNDS });
  });

  it("shows the label-association screen first, not the settlement list", async () => {
    mockCompute.mockResolvedValue({ success: true, data: makeReconciliation([MATCHED_LINE]) });

    renderView();

    await waitFor(() => {
      expect(document.getElementById("bank-statement-label-association-continue")).not.toBeNull();
    });
    expect(document.getElementById("reconciliation-list")).toBeNull();
  });

  it("calls computeBankStatementReconciliation with bankAccountId + parseResult on mount", async () => {
    mockCompute.mockResolvedValue({ success: true, data: makeReconciliation([MATCHED_LINE]) });

    renderView();

    await waitFor(() => {
      expect(document.getElementById("bank-statement-label-association-continue")).not.toBeNull();
    });
    expect(mockCompute).toHaveBeenCalledWith(BANK_ACCOUNT_ID, PARSE_RESULT, []);
  });

  it("switches to the settlement screen when Continuer is clicked", async () => {
    const user = userEvent.setup();
    mockCompute.mockResolvedValue({ success: true, data: makeReconciliation([MATCHED_LINE]) });

    renderView();
    await goToSettlement(user);

    expect(document.getElementById("reconciliation-list")).not.toBeNull();
    expect(document.getElementById("bank-statement-label-association-continue")).toBeNull();
  });

  it("shows the step bar, and back from the matching offers to return there (#697)", async () => {
    const user = userEvent.setup();
    mockCompute.mockResolvedValue({ success: true, data: makeReconciliation([MATCHED_LINE]) });

    renderView();
    await waitFor(() => {
      expect(
        document.getElementById("bank-statement-step-labels")?.getAttribute("aria-current"),
      ).toBe("step");
    });
    await goToSettlement(user);
    expect(
      document.getElementById("bank-statement-step-matching")?.getAttribute("aria-current"),
    ).toBe("step");

    const back = document.getElementById("reconciliation-back-to-labels");
    if (!back) throw new Error("back button missing");
    await user.click(back);

    expect(document.getElementById("bank-statement-label-association-continue")?.textContent).toBe(
      "label_association.back_to_matching",
    );
  });

  it("lists every line of the statement; an ignored label's line shows but does not open (#697)", async () => {
    const user = userEvent.setup();
    mockCompute.mockResolvedValue({
      success: true,
      data: makeReconciliation([MATCHED_LINE, REJECTED_LINE]),
    });

    renderView();
    await goToSettlement(user);

    expect(document.getElementById("reconciliation-line-row-line-matched")).not.toBeNull();
    const rejected = document.getElementById("reconciliation-line-row-line-rejected");
    if (!rejected) throw new Error("rejected row missing");
    await user.dblClick(rejected);
    expect(document.getElementById("bank-statement-assign-groups-modal")).toBeNull();
  });

  it("returns to the label screen via 'Retour aux libellés' with the draft intact (BAS-102/120D)", async () => {
    const user = userEvent.setup();
    mockCompute.mockResolvedValue({ success: true, data: makeReconciliation([MATCHED_LINE]) });

    renderView();
    await goToSettlement(user);

    const backBtn = document.getElementById("reconciliation-back-to-labels");
    expect(backBtn).not.toBeNull();
    if (!backBtn) throw new Error("back-to-labels button missing");
    await user.click(backBtn);

    await waitFor(() => {
      expect(document.getElementById("bank-statement-label-association-continue")).not.toBeNull();
    });
    expect(document.getElementById("reconciliation-list")).toBeNull();
    // The label was already decided before navigating away — still decided
    // on return (no state reset, one correction model).
    expect(
      (document.getElementById("bank-statement-label-association-continue") as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("does not render the settlement Valider button on the label screen", async () => {
    mockCompute.mockResolvedValue({ success: true, data: makeReconciliation([MATCHED_LINE]) });

    renderView();

    await waitFor(() => {
      expect(document.getElementById("bank-statement-label-association-continue")).not.toBeNull();
    });
    expect(document.getElementById("reconciliation-validate")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// BAS-123 — validate gate
// ---------------------------------------------------------------------------

describe("ReconciliationView — « Récapitulatif › » waits for every line (BAS-123)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: MOCK_FUNDS });
  });

  const toRecap = () =>
    document.getElementById("reconciliation-to-recap") as HTMLButtonElement | null;

  it("is off while a line is to match", async () => {
    const user = userEvent.setup();
    mockCompute.mockResolvedValue({ success: true, data: makeReconciliation([NEEDS_GROUP_LINE]) });

    renderView();
    await goToSettlement(user);

    expect(toRecap()?.disabled).toBe(true);
  });

  it("is on once every line is matched or ignored", async () => {
    const user = userEvent.setup();
    mockCompute.mockResolvedValue({
      success: true,
      data: makeReconciliation([MATCHED_LINE, REJECTED_LINE]),
    });

    renderView();
    await goToSettlement(user);

    expect(toRecap()?.disabled).toBe(false);
  });

  it("is on when every label is ignored", async () => {
    const user = userEvent.setup();
    mockCompute.mockResolvedValue({ success: true, data: makeReconciliation([REJECTED_LINE]) });

    renderView();
    await goToSettlement(user);

    expect(toRecap()?.disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Modal routing (settlement only — BAS-062/122B, no more LinkFundModal)
// ---------------------------------------------------------------------------

describe("ReconciliationView — modal routing on the settlement screen (BAS-062)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: MOCK_FUNDS });
  });

  it("opens AssignGroupsModal when a NeedsGroup line is double-clicked", async () => {
    const user = userEvent.setup();
    mockCompute.mockResolvedValue({ success: true, data: makeReconciliation([NEEDS_GROUP_LINE]) });

    renderView();
    await goToSettlement(user);

    const lineEl = document.getElementById("reconciliation-line-row-line-needs-group");
    if (!lineEl) throw new Error("line row element missing");
    await user.dblClick(lineEl);

    expect(document.getElementById("bank-statement-assign-groups-submit")).not.toBeNull();
  });

  it("opens AssignGroupsModal for a Matched line (override — BAS-062)", async () => {
    const user = userEvent.setup();
    mockCompute.mockResolvedValue({ success: true, data: makeReconciliation([MATCHED_LINE]) });

    renderView();
    await goToSettlement(user);

    const lineEl = document.getElementById("reconciliation-line-row-line-matched");
    if (!lineEl) throw new Error("line row element missing");
    await user.dblClick(lineEl);

    expect(document.getElementById("bank-statement-assign-groups-submit")).not.toBeNull();
  });

  it("calls computeBankStatementReconciliation with the AssignGroups correction and closes the modal on success", async () => {
    const user = userEvent.setup();
    mockCompute
      .mockResolvedValueOnce({ success: true, data: makeReconciliation([NEEDS_GROUP_LINE]) })
      .mockResolvedValueOnce({
        success: true,
        data: makeReconciliation([{ ...NEEDS_GROUP_LINE, status: "Matched" }]),
      });

    renderView();
    await goToSettlement(user);

    const lineEl = document.getElementById("reconciliation-line-row-line-needs-group");
    if (!lineEl) throw new Error("line row element missing");
    await user.dblClick(lineEl);

    const checkbox = document.getElementById("bank-statement-assign-groups-check-group-1");
    if (!checkbox) throw new Error("candidate checkbox missing");
    await user.click(checkbox);

    const submitBtn = document.getElementById("bank-statement-assign-groups-submit");
    if (!submitBtn) throw new Error("submit button missing");
    await user.click(submitBtn);

    await waitFor(() => {
      const calls = mockCompute.mock.calls;
      const correctionCall = calls.find((c) => c[2].length > 0 && c[2][0]?.type === "AssignGroups");
      expect(correctionCall).toBeDefined();
    });
    await waitFor(() => {
      expect(document.getElementById("bank-statement-assign-groups-submit")).toBeNull();
    });
  });

  it("cancelling AssignGroupsModal closes it without calling computeBankStatementReconciliation again", async () => {
    const user = userEvent.setup();
    mockCompute.mockResolvedValue({ success: true, data: makeReconciliation([NEEDS_GROUP_LINE]) });

    renderView();
    await goToSettlement(user);

    const callCountAfterSettlement = mockCompute.mock.calls.length;

    await user.dblClick(document.getElementById("reconciliation-line-row-line-needs-group")!);
    expect(document.getElementById("bank-statement-assign-groups-submit")).not.toBeNull();

    await user.click(document.getElementById("bank-statement-assign-groups-cancel")!);

    await waitFor(() => {
      expect(document.getElementById("bank-statement-assign-groups-submit")).toBeNull();
    });
    expect(mockCompute).toHaveBeenCalledTimes(callCountAfterSettlement);
  });
});

// ---------------------------------------------------------------------------
// Step 4 — the recap (#697)
// ---------------------------------------------------------------------------

describe("ReconciliationView — the recap (#697)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: MOCK_FUNDS });
  });

  it("shows the month, the lines taken and the total; back returns to the matching", async () => {
    const user = userEvent.setup();
    mockCompute.mockResolvedValue({
      success: true,
      data: makeReconciliation([MATCHED_LINE], {
        recap: {
          lines_taken_count: 1,
          total_amount: 150000,
          partly_paid_lines: [],
          period_start: "2026-10-01",
          period_end: "2026-10-31",
          period_month: "2026-10",
        },
      }),
    });

    renderView();
    await goToRecap(user);

    expect(document.getElementById("bank-statement-step-recap")?.getAttribute("aria-current")).toBe(
      "step",
    );
    expect(document.getElementById("recap-lines-taken")?.textContent).toBe("1");
    expect(document.getElementById("recap-period")?.textContent).toMatch(/2026/);
    expect(document.getElementById("recap-anomalies-empty")).not.toBeNull();
    expect(mockValidate).not.toHaveBeenCalled();

    await user.click(document.getElementById("recap-back")!);
    expect(document.getElementById("reconciliation-list")).not.toBeNull();
  });

  it("shows the period when it is not a whole month, and a partly paid line with its reliquat", async () => {
    const user = userEvent.setup();
    mockCompute.mockResolvedValue({
      success: true,
      data: makeReconciliation([MATCHED_LINE], {
        recap: {
          lines_taken_count: 1,
          total_amount: 150000,
          partly_paid_lines: [
            {
              line_id: "line-matched",
              credit_line: MATCHED_LINE.credit_line,
              fund_id: "fund-1",
              covered_amount: 100000,
              remainder_amount: 50000,
            },
          ],
          period_start: "2026-09-15",
          period_end: "2026-10-14",
          period_month: null,
        },
      }),
    });

    renderView();
    await goToRecap(user);

    // Not a whole month: the period's two dates instead (#692).
    expect(document.getElementById("recap-period")?.textContent).toMatch(
      /15\/09\/2026.*14\/10\/2026/,
    );
    const row = document.getElementById("recap-anomaly-line-matched");
    expect(row?.textContent).toContain("CPAM 75");
    expect(document.getElementById("recap-anomalies-empty")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Validate → done/summary state (BAS-093)
// ---------------------------------------------------------------------------

describe("ReconciliationView — validate flow (BAS-093)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: MOCK_FUNDS });
  });

  it("calls validateBankStatementReconciliation and shows the done/summary state on success", async () => {
    const user = userEvent.setup();
    mockCompute.mockResolvedValue({ success: true, data: makeReconciliation([MATCHED_LINE]) });
    mockValidate.mockResolvedValue({ success: true, data: 5 });

    renderView();
    await goToRecap(user);

    const validateBtn = document.getElementById("reconciliation-validate");
    if (!validateBtn) throw new Error("validate button missing");
    await user.click(validateBtn);

    expect(mockValidate).toHaveBeenCalledWith(BANK_ACCOUNT_ID, PARSE_RESULT, []);

    await waitFor(() => {
      expect(document.getElementById("recap-figures")).toBeNull();
    });
    expect(document.getElementById("reconciliation-done")?.textContent).toContain(
      "statement.modal.done",
    );
  });

  it("calls onClose from the done/summary close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockCompute.mockResolvedValue({ success: true, data: makeReconciliation([MATCHED_LINE]) });
    mockValidate.mockResolvedValue({ success: true, data: 3 });

    renderView(onClose);
    await goToRecap(user);

    await user.click(document.getElementById("reconciliation-validate")!);

    await waitFor(() => {
      expect(document.getElementById("recap-figures")).toBeNull();
    });

    const closeBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("statement.modal.close"),
    ) as HTMLButtonElement | null;
    expect(closeBtn).not.toBeNull();
    if (!closeBtn) throw new Error("done close button missing");
    await user.click(closeBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("validate returning an error does NOT transition to the done state and keeps the recap", async () => {
    const user = userEvent.setup();
    mockCompute.mockResolvedValue({ success: true, data: makeReconciliation([MATCHED_LINE]) });
    mockValidate.mockResolvedValue({ success: false, error: { code: "DatabaseError" } });

    renderView();
    await goToRecap(user);

    await user.click(document.getElementById("reconciliation-validate")!);

    await waitFor(() => {
      expect(document.getElementById("recap-error")).not.toBeNull();
    });
    const doneText = Array.from(document.querySelectorAll("p")).find((p) =>
      p.textContent?.includes("statement.modal.done"),
    );
    expect(doneText).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// isBusy state (BAS-064)
// ---------------------------------------------------------------------------

describe("ReconciliationView — isBusy disables buttons (BAS-064)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: MOCK_FUNDS });
  });

  it("disables « Récapitulatif › » and the way back while a correction runs", async () => {
    const user = userEvent.setup();
    let resolveSecond!: (v: { success: true; data: BankStatementReconciliation }) => void;

    mockCompute
      .mockResolvedValueOnce({ success: true, data: makeReconciliation([NEEDS_GROUP_LINE]) })
      .mockReturnValueOnce(
        new Promise<{ success: true; data: BankStatementReconciliation }>((r) => {
          resolveSecond = r;
        }),
      );

    renderView();
    await goToSettlement(user);

    await user.dblClick(document.getElementById("reconciliation-line-row-line-needs-group")!);
    const checkbox = document.getElementById("bank-statement-assign-groups-check-group-1");
    if (!checkbox) throw new Error("candidate checkbox missing");
    await user.click(checkbox);
    await user.click(document.getElementById("bank-statement-assign-groups-submit")!);

    await waitFor(() => {
      const backBtn = document.getElementById(
        "reconciliation-back-to-labels",
      ) as HTMLButtonElement | null;
      expect(backBtn?.disabled).toBe(true);
    });

    resolveSecond({ success: true, data: makeReconciliation([MATCHED_LINE]) });
  });
});

// ---------------------------------------------------------------------------
// Typed error render via F27 pipeline (BAS-064 compute error)
// ---------------------------------------------------------------------------

describe("ReconciliationView — typed error render (F27)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: MOCK_FUNDS });
  });

  it("surfaces an error via the modal's alert when computeBankStatementReconciliation returns an error after a correction", async () => {
    const user = userEvent.setup();
    mockCompute
      .mockResolvedValueOnce({ success: true, data: makeReconciliation([NEEDS_GROUP_LINE]) })
      .mockResolvedValueOnce({ success: false, error: { code: "AssignmentOverflow" } });

    renderView();
    await goToSettlement(user);

    await user.dblClick(document.getElementById("reconciliation-line-row-line-needs-group")!);
    const checkbox = document.getElementById("bank-statement-assign-groups-check-group-1");
    if (!checkbox) throw new Error("candidate checkbox missing");
    await user.click(checkbox);
    await user.click(document.getElementById("bank-statement-assign-groups-submit")!);

    await waitFor(() => {
      const alert = document.querySelector("[role='alert']");
      expect(alert).not.toBeNull();
      expect(alert?.textContent).toContain("bank:reconciliation.error.assignment_overflow");
    });
  });
});
