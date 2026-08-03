/**
 * RTL component integration tests — ReconciliationList (BAS-060/061/062/069).
 *
 * Mocks the gateway at the feature boundary (F3/F27); never touches commands.*.
 * Uses stable `id` selectors (F25, E4); asserts i18n keys via the real i18n
 * instance seeded in test-setup.ts (language: "en").
 *
 * These tests will fail until ui/ReconciliationList.tsx is created.
 */

import { render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BankStatementLine, BankStatementReconciliation, Fund } from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";

// ---------------------------------------------------------------------------
// Mock the gateway boundary (F3 — only gateway.ts may call commands.*)
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

import { ReconciliationList } from "./ReconciliationList";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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
    broadened_candidates: [],
    candidate_procedures: [],
    suggested_fund_id: null,
    suggested_fund_name: null,
    ...overrides,
  };
}

function makeReconciliation(
  lines: BankStatementLine[],
  resolvedCount: number,
  needsCorrectionCount: number,
): BankStatementReconciliation {
  return { lines, resolved_count: resolvedCount, needs_correction_count: needsCorrectionCount };
}

// Funds resolve linked lines' fund_id → name (fund-1 → "CPAM 75", fund-2 → "MGEN").
// Unlinked lines (fund_id null) still render their raw bank label.
const MOCK_FUNDS: Fund[] = [
  { id: "fund-1", fund_identifier: "75", name: "CPAM 75", temp_id: null },
  { id: "fund-2", fund_identifier: "93", name: "MGEN", temp_id: null },
];

const MATCHED_LINE = makeLine({ line_id: "line-1", status: "Matched" });
const NEEDS_LINK_LINE = makeLine({
  line_id: "line-2",
  credit_line: { date: "2026-04-11", label: "MGEN", amount: 75000 },
  status: "NeedsLink",
  fund_id: null,
  assigned_group_ids: [],
  covered_amount: 0,
});
const NEEDS_GROUP_LINE = makeLine({
  line_id: "line-3",
  credit_line: { date: "2026-04-12", label: "CPAM93", amount: 200000 },
  status: "NeedsGroup",
  fund_id: "fund-2",
  assigned_group_ids: [],
  covered_amount: 0,
  candidate_groups: [
    {
      group_id: "group-cand-1",
      fund_id: "fund-2",
      fund_name: "Mutuelle Générale",
      payment_date: "2026-04-09",
      total_amount: 200000,
      is_exact_amount: true,
    },
  ],
});

// ---------------------------------------------------------------------------
// BAS-060 — document order rendering
// ---------------------------------------------------------------------------

describe("ReconciliationList — document order rendering (BAS-060)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: MOCK_FUNDS });
  });

  it("renders all lines in document order with their line_id as stable id (BAS-060, F25)", () => {
    const reconciliation = makeReconciliation([MATCHED_LINE, NEEDS_LINK_LINE], 1, 1);

    render(
      <ReconciliationList
        reconciliation={reconciliation}
        onApplyCorrection={vi.fn()}
        isBusy={false}
      />,
    );

    const line1 = document.getElementById("reconciliation-line-row-line-1");
    const line2 = document.getElementById("reconciliation-line-row-line-2");
    expect(line1).not.toBeNull();
    expect(line2).not.toBeNull();

    // Document order: line-1 appears before line-2 in the DOM
    const allLines = document.querySelectorAll("[id^='reconciliation-line-row-']");
    expect(allLines[0]?.id).toBe("reconciliation-line-row-line-1");
    expect(allLines[1]?.id).toBe("reconciliation-line-row-line-2");
  });

  it("resolves the fund name for a linked line and falls back to the bank label when unlinked", () => {
    // line-1 (Matched) is linked to fund-1 → resolved name "CPAM 75";
    // line-2 (NeedsLink, fund_id null) still shows its raw bank label "MGEN".
    const reconciliation = makeReconciliation([MATCHED_LINE, NEEDS_LINK_LINE], 1, 1);

    render(
      <ReconciliationList
        reconciliation={reconciliation}
        onApplyCorrection={vi.fn()}
        isBusy={false}
      />,
    );

    const linkedRow = document.getElementById("reconciliation-line-row-line-1");
    if (!linkedRow) throw new Error("linked row missing");
    expect(within(linkedRow).getByText("CPAM 75")).not.toBeNull();

    const unlinkedRow = document.getElementById("reconciliation-line-row-line-2");
    if (!unlinkedRow) throw new Error("unlinked row missing");
    expect(within(unlinkedRow).getByText("MGEN")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// BAS-061 — per-line status visible in DOM
// ---------------------------------------------------------------------------

describe("ReconciliationList — per-line status (BAS-061)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: MOCK_FUNDS });
  });

  it("renders the status indicator for a Matched line (BAS-061)", () => {
    const reconciliation = makeReconciliation([MATCHED_LINE], 1, 0);

    render(
      <ReconciliationList
        reconciliation={reconciliation}
        onApplyCorrection={vi.fn()}
        isBusy={false}
      />,
    );

    // Status rendered under a stable id; the i18n key is what we assert (F24)
    const statusEl = document.getElementById("reconciliation-line-status-line-1");
    expect(statusEl).not.toBeNull();
  });

  it("renders the status indicator for a NeedsLink line (BAS-061)", () => {
    const reconciliation = makeReconciliation([NEEDS_LINK_LINE], 0, 1);

    render(
      <ReconciliationList
        reconciliation={reconciliation}
        onApplyCorrection={vi.fn()}
        isBusy={false}
      />,
    );

    const statusEl = document.getElementById("reconciliation-line-status-line-2");
    expect(statusEl).not.toBeNull();
  });

  // Field report 2026-07-30 — "fund unknown" must be visually distinct from
  // "transaction missing": NeedsLink badge uses the primary-container family,
  // NeedsGroup keeps the gold attention family, and the unlinked raw bank
  // label renders italic so it cannot pass for a fund name.
  it("distinguishes NeedsLink (fund unknown) from NeedsGroup (transaction missing)", () => {
    const reconciliation = makeReconciliation([NEEDS_LINK_LINE, NEEDS_GROUP_LINE], 0, 2);

    render(
      <ReconciliationList
        reconciliation={reconciliation}
        onApplyCorrection={vi.fn()}
        isBusy={false}
      />,
    );

    const linkBadge = document.getElementById(
      `reconciliation-line-status-${NEEDS_LINK_LINE.line_id}`,
    );
    const groupBadge = document.getElementById(
      `reconciliation-line-status-${NEEDS_GROUP_LINE.line_id}`,
    );
    expect(linkBadge?.className).toContain("bg-m3-primary-container");
    expect(groupBadge?.className).toContain("bg-m3-tertiary-container");

    // Unlinked raw label is styled muted+italic.
    const linkRow = document.getElementById(`reconciliation-line-row-${NEEDS_LINK_LINE.line_id}`);
    const rawLabel = linkRow?.querySelector("span.italic");
    expect(rawLabel?.textContent).toBe(NEEDS_LINK_LINE.credit_line.label);
  });
});

// ---------------------------------------------------------------------------
// BAS-069 — summary count
// ---------------------------------------------------------------------------

describe("ReconciliationList — summary count (BAS-069)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: MOCK_FUNDS });
  });

  it("renders a summary element with the resolved and needs-correction counts (BAS-069)", () => {
    const reconciliation = makeReconciliation([MATCHED_LINE, NEEDS_LINK_LINE], 1, 1);

    render(
      <ReconciliationList
        reconciliation={reconciliation}
        onApplyCorrection={vi.fn()}
        isBusy={false}
      />,
    );

    const summary = document.getElementById("reconciliation-summary");
    expect(summary).not.toBeNull();
  });

  it("summary reflects 2 resolved, 0 needs-correction when all lines matched", () => {
    const allMatched = makeReconciliation(
      [MATCHED_LINE, makeLine({ line_id: "line-x", status: "Matched" })],
      2,
      0,
    );

    render(
      <ReconciliationList reconciliation={allMatched} onApplyCorrection={vi.fn()} isBusy={false} />,
    );

    const summary = document.getElementById("reconciliation-summary");
    expect(summary).not.toBeNull();
    // The summary must include the resolved count somewhere in its subtree
    expect(summary?.textContent).toMatch(/2/);
  });
});

// ---------------------------------------------------------------------------
// BAS-062 — double-click on a correction-needed line calls onApplyCorrection
// ---------------------------------------------------------------------------

describe("ReconciliationList — double-click opens correction modal (BAS-062)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: MOCK_FUNDS });
  });

  it("calls onApplyCorrection with the line when a needs-link line is double-clicked (BAS-062)", async () => {
    const user = userEvent.setup();
    const onApplyCorrection = vi.fn();
    const reconciliation = makeReconciliation([NEEDS_LINK_LINE], 0, 1);

    render(
      <ReconciliationList
        reconciliation={reconciliation}
        onApplyCorrection={onApplyCorrection}
        isBusy={false}
      />,
    );

    const lineEl = document.getElementById("reconciliation-line-row-line-2");
    expect(lineEl).not.toBeNull();
    if (!lineEl) throw new Error("line element missing");

    await user.dblClick(lineEl);

    expect(onApplyCorrection).toHaveBeenCalledWith(NEEDS_LINK_LINE);
  });

  it("calls onApplyCorrection with the line when a needs-group line is double-clicked (BAS-062)", async () => {
    const user = userEvent.setup();
    const onApplyCorrection = vi.fn();
    const reconciliation = makeReconciliation([NEEDS_GROUP_LINE], 0, 1);

    render(
      <ReconciliationList
        reconciliation={reconciliation}
        onApplyCorrection={onApplyCorrection}
        isBusy={false}
      />,
    );

    const lineEl = document.getElementById("reconciliation-line-row-line-3");
    expect(lineEl).not.toBeNull();
    if (!lineEl) throw new Error("line element missing");

    await user.dblClick(lineEl);

    expect(onApplyCorrection).toHaveBeenCalledWith(NEEDS_GROUP_LINE);
  });

  it("does NOT prevent double-click on a Matched line (override allowed per BAS-062)", async () => {
    const user = userEvent.setup();
    const onApplyCorrection = vi.fn();
    const reconciliation = makeReconciliation([MATCHED_LINE], 1, 0);

    render(
      <ReconciliationList
        reconciliation={reconciliation}
        onApplyCorrection={onApplyCorrection}
        isBusy={false}
      />,
    );

    const lineEl = document.getElementById("reconciliation-line-row-line-1");
    expect(lineEl).not.toBeNull();
    if (!lineEl) throw new Error("line element missing");

    await user.dblClick(lineEl);

    // Matched lines can also be opened for override (BAS-062)
    expect(onApplyCorrection).toHaveBeenCalledWith(MATCHED_LINE);
  });

  it("does not call onApplyCorrection while isBusy=true (BAS-064 busy state)", async () => {
    const user = userEvent.setup();
    const onApplyCorrection = vi.fn();
    const reconciliation = makeReconciliation([NEEDS_LINK_LINE], 0, 1);

    render(
      <ReconciliationList
        reconciliation={reconciliation}
        onApplyCorrection={onApplyCorrection}
        isBusy={true}
      />,
    );

    const lineEl = document.getElementById("reconciliation-line-row-line-2");
    if (!lineEl) throw new Error("line element missing");

    await user.dblClick(lineEl);

    expect(onApplyCorrection).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// BAS-100 — wizard button present at the top of the list
// ---------------------------------------------------------------------------

describe("ReconciliationList — wizard button (BAS-100)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: MOCK_FUNDS });
  });

  it("renders the wizard launch button with stable id (BAS-100, F25)", () => {
    const reconciliation = makeReconciliation([NEEDS_LINK_LINE], 0, 1);

    render(
      <ReconciliationList
        reconciliation={reconciliation}
        onApplyCorrection={vi.fn()}
        isBusy={false}
        onOpenWizard={vi.fn()}
      />,
    );

    const wizardBtn = document.getElementById("reconciliation-wizard-btn");
    expect(wizardBtn).not.toBeNull();
  });

  it("calls onOpenWizard when the wizard button is clicked (BAS-100)", async () => {
    const user = userEvent.setup();
    const onOpenWizard = vi.fn();
    const reconciliation = makeReconciliation([NEEDS_LINK_LINE], 0, 1);

    render(
      <ReconciliationList
        reconciliation={reconciliation}
        onApplyCorrection={vi.fn()}
        isBusy={false}
        onOpenWizard={onOpenWizard}
      />,
    );

    const wizardBtn = document.getElementById("reconciliation-wizard-btn");
    if (!wizardBtn) throw new Error("wizard button missing");

    await user.click(wizardBtn);

    expect(onOpenWizard).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// BAS-069 — hide-resolved filter
// ---------------------------------------------------------------------------

describe("ReconciliationList — hide-resolved filter (BAS-069)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: MOCK_FUNDS });
  });

  it("hides Matched/Rejected rows but keeps correction-needed rows when toggled (BAS-069)", async () => {
    const user = userEvent.setup();
    const REJECTED_LINE = makeLine({
      line_id: "line-rejected",
      status: "Rejected",
      fund_id: null,
    });
    // Mixed list: resolved (Matched, Rejected) + correction-needed (NeedsLink, NeedsGroup).
    const reconciliation = makeReconciliation(
      [MATCHED_LINE, NEEDS_LINK_LINE, REJECTED_LINE, NEEDS_GROUP_LINE],
      2,
      2,
    );

    render(
      <ReconciliationList
        reconciliation={reconciliation}
        onApplyCorrection={vi.fn()}
        isBusy={false}
      />,
    );

    // All four rows visible by default.
    expect(document.getElementById("reconciliation-line-row-line-1")).not.toBeNull();
    expect(document.getElementById("reconciliation-line-row-line-rejected")).not.toBeNull();

    const toggle = document.getElementById("reconciliation-hide-resolved");
    expect(toggle).not.toBeNull();
    if (!toggle) throw new Error("hide-resolved toggle missing");

    await user.click(toggle);

    // Resolved rows hidden; correction-needed rows still shown.
    expect(document.getElementById("reconciliation-line-row-line-1")).toBeNull();
    expect(document.getElementById("reconciliation-line-row-line-rejected")).toBeNull();
    expect(document.getElementById("reconciliation-line-row-line-2")).not.toBeNull();
    expect(document.getElementById("reconciliation-line-row-line-3")).not.toBeNull();

    // The summary count is unaffected by the filter.
    expect(document.getElementById("reconciliation-summary")?.textContent).toMatch(/2/);
  });

  it("preserves document order among the shown rows when filtering (BAS-060/069)", async () => {
    const user = userEvent.setup();
    // Order: NeedsLink, Matched, NeedsGroup — after hiding Matched, NeedsLink stays before NeedsGroup.
    const reconciliation = makeReconciliation(
      [NEEDS_LINK_LINE, MATCHED_LINE, NEEDS_GROUP_LINE],
      1,
      2,
    );

    render(
      <ReconciliationList
        reconciliation={reconciliation}
        onApplyCorrection={vi.fn()}
        isBusy={false}
      />,
    );

    const toggle = document.getElementById("reconciliation-hide-resolved");
    if (!toggle) throw new Error("hide-resolved toggle missing");
    await user.click(toggle);

    const shown = document.querySelectorAll("[id^='reconciliation-line-row-']");
    expect(shown[0]?.id).toBe("reconciliation-line-row-line-2");
    expect(shown[1]?.id).toBe("reconciliation-line-row-line-3");
  });
});

// ---------------------------------------------------------------------------
// BAS-122 — the summary count is computed frontend-side over the lines array,
// NOT from the wire's whole-document resolved_count/needs_correction_count
// (settlement screen shows only linked labels' lines — the wire counts are
// unconsumed and may not match the visible subset).
// ---------------------------------------------------------------------------

describe("ReconciliationList — FE-computed summary count (BAS-122)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: MOCK_FUNDS });
  });

  it("computes the summary from the lines array, ignoring mismatched wire counts", () => {
    // Deliberately wrong wire counts (as if the whole-document counters from a
    // different, larger draft leaked in) — the rendered summary must reflect
    // only the two lines actually passed in (1 resolved, 1 needs-correction).
    const reconciliation = makeReconciliation([MATCHED_LINE, NEEDS_GROUP_LINE], 99, 99);

    render(
      <ReconciliationList reconciliation={reconciliation} onApplyCorrection={vi.fn()} isBusy={false} />,
    );

    const summary = document.getElementById("reconciliation-summary");
    expect(summary?.textContent).not.toMatch(/99/);
    expect(summary?.textContent).toMatch(/1/);
  });
});

// ---------------------------------------------------------------------------
// BAS-123C — left-aside badge: a Matched line with zero settlement items and
// an acknowledged remainder renders a distinct badge from an ordinary match.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// BAS-119 — the candidate/line-list region is the only scrollable area, so
// the wizard button and validate footer stay pinned in view. Cheap structural
// check only; the rest is visual proof (docs/frontend-visual-proof.md).
// ---------------------------------------------------------------------------

describe("ReconciliationList — scrollable region (BAS-119)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: MOCK_FUNDS });
  });

  it("wraps the line table in a dedicated scrollable region", () => {
    const reconciliation = makeReconciliation([MATCHED_LINE], 1, 0);

    render(
      <ReconciliationList reconciliation={reconciliation} onApplyCorrection={vi.fn()} isBusy={false} />,
    );

    const scrollzone = document.getElementById("reconciliation-list-scrollzone");
    expect(scrollzone).not.toBeNull();
    expect(scrollzone?.className).toContain("overflow-y-auto");
    expect(scrollzone?.contains(document.getElementById("reconciliation-line-row-line-1"))).toBe(
      true,
    );
  });
});

describe("ReconciliationList — left-aside badge (BAS-123C)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: MOCK_FUNDS });
  });

  it("renders the left-aside key for a Matched line with zero items and an acknowledged remainder", () => {
    const leftAsideLine = makeLine({
      line_id: "line-left-aside",
      status: "Matched",
      assigned_group_ids: [],
      assigned_procedure_ids: [],
      covered_amount: 0,
      remainder_acknowledged: true,
    });
    const reconciliation = makeReconciliation([leftAsideLine], 1, 0);

    render(
      <ReconciliationList reconciliation={reconciliation} onApplyCorrection={vi.fn()} isBusy={false} />,
    );

    const badge = document.getElementById("reconciliation-line-status-line-left-aside");
    expect(badge?.textContent).toBe("bank:reconciliation.status.left_aside");
  });

  it("renders the ordinary matched key for a ordinary Matched line (distinct from left-aside)", () => {
    const reconciliation = makeReconciliation([MATCHED_LINE], 1, 0);

    render(
      <ReconciliationList reconciliation={reconciliation} onApplyCorrection={vi.fn()} isBusy={false} />,
    );

    const badge = document.getElementById("reconciliation-line-status-line-1");
    expect(badge?.textContent).toBe("bank:reconciliation.status.matched");
    expect(badge?.textContent).not.toBe("bank:reconciliation.status.left_aside");
  });
});
