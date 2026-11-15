/**
 * RTL integration tests — LabelAssociationScreen, step 2 of the bank statement
 * import (#697, the validated mocks of #692): one row per label with an
 * « Ignorer » switch, a searchable fund field and a tag for where its link
 * comes from; the header counter; the common footer; the note on a link
 * changed after the matching (BAS-066B).
 *
 * react-i18next is mocked to echo keys, so assertions read stable keys.
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

// ADR-004 — the HeadlessUI combobox is not reliably drivable in jsdom; a
// native select stands in for it, its own behaviour left to its suite.
vi.mock("@/ui/components/field/ComboboxField", () => ({
  ComboboxField: ({
    id,
    value,
    onChange,
    items,
    disabled,
  }: {
    id: string;
    value: string;
    onChange: (id: string) => void;
    items: { id: string; name: string }[];
    disabled?: boolean;
  }) => (
    <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">-</option>
      {items.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </select>
  ),
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
    recap: { lines_taken_count: 0, total_amount: 0, partly_paid_lines: [] },
  };
}

// The four origins: saved and unchanged, newly linked, to link, ignored.
const KNOWN = makeLine({
  line_id: "line-0",
  credit_line: { date: "2026-04-01", label: "KNOWN", amount: 1000 },
  status: "Matched",
  fund_id: "fund-1",
});
const NEW = makeLine({
  line_id: "line-1",
  credit_line: { date: "2026-04-02", label: "NEW", amount: 2000 },
  status: "NeedsGroup",
  fund_id: "fund-2",
});
const TODO = makeLine({
  line_id: "line-2",
  credit_line: { date: "2026-04-03", label: "TODO", amount: 3000 },
  suggested_fund_name: "CPAM 75",
});
const IGNORED = makeLine({
  line_id: "line-3",
  credit_line: { date: "2026-04-04", label: "IGNORED", amount: 4000 },
  status: "Rejected",
});

// What the saved links gave before any correction: NEW had no fund yet.
const INITIAL = [KNOWN, { ...NEW, fund_id: null, status: "NeedsLink" as const }, TODO, IGNORED];

interface Overrides {
  lines?: BankStatementLine[];
  initial?: BankStatementLine[];
  onApplyCorrection?: (c: BankStatementCorrection) => Promise<boolean>;
  onContinue?: () => void;
  onCancel?: () => void;
  linksAtMatching?: ReadonlyMap<string, string | null> | null;
}

function renderScreen(overrides: Overrides = {}) {
  const linksAtMatching = overrides.linksAtMatching ?? null;
  return render(
    <LabelAssociationScreen
      reconciliation={makeReconciliation(overrides.lines ?? [KNOWN, NEW, TODO, IGNORED])}
      initialReconciliation={makeReconciliation(overrides.initial ?? INITIAL)}
      isBusy={false}
      onApplyCorrection={overrides.onApplyCorrection ?? vi.fn().mockResolvedValue(true)}
      onContinue={overrides.onContinue ?? vi.fn()}
      onCancel={overrides.onCancel ?? vi.fn()}
      linksAtMatching={linksAtMatching}
    />,
  );
}

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`#${id} missing`);
  return found;
}

describe("LabelAssociationScreen — step 2 (#697)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: MOCK_FUNDS });
  });

  it("tags each label by where its link comes from", () => {
    renderScreen();

    expect(element("label-assoc-chip-KNOWN").textContent).toBe("label_association.chip.known");
    expect(element("label-assoc-chip-NEW").textContent).toBe("label_association.chip.new");
    expect(element("label-assoc-chip-TODO").textContent).toBe("label_association.chip.todo");
    expect(element("label-assoc-chip-IGNORED").textContent).toBe("label_association.chip.ignored");
  });

  it("counts the origins in the header", () => {
    renderScreen();

    const counter = element("label-assoc-counter").textContent ?? "";
    expect(counter).toContain('label_association.counter.known:{"count":1}');
    expect(counter).toContain('label_association.counter.todo:{"count":1}');
    expect(counter).toContain('label_association.counter.ignored:{"count":1}');
  });

  it("shows a suggestion under the field of a label to link, and a note under an ignored one", () => {
    renderScreen();

    expect(element("label-assoc-suggestion-TODO").textContent).toContain("CPAM 75");
    expect(element("label-assoc-row-IGNORED").textContent).toContain(
      "label_association.ignored_note",
    );
  });

  it("ignores a label with its switch", async () => {
    const user = userEvent.setup();
    const onApplyCorrection = vi.fn().mockResolvedValue(true);
    renderScreen({ onApplyCorrection });

    await user.click(element("label-assoc-ignore-TODO"));

    expect(onApplyCorrection).toHaveBeenCalledWith({
      type: "LinkFund",
      bank_label: "TODO",
      assignment: { type: "Rejected" },
    });
  });

  it("turns an ignored label back to « À associer » until a fund is picked, sending nothing", async () => {
    const user = userEvent.setup();
    const onApplyCorrection = vi.fn().mockResolvedValue(true);
    renderScreen({ lines: [KNOWN, IGNORED], initial: [KNOWN, IGNORED], onApplyCorrection });

    await user.click(element("label-assoc-ignore-IGNORED"));

    expect(onApplyCorrection).not.toHaveBeenCalled();
    expect(element("label-assoc-chip-IGNORED").textContent).toBe("label_association.chip.todo");
    expect((element("label-assoc-continue") as HTMLButtonElement).disabled).toBe(true);
  });

  it("links a label to the fund picked", async () => {
    const user = userEvent.setup();
    const onApplyCorrection = vi.fn().mockResolvedValue(true);
    renderScreen({ onApplyCorrection });

    await user.selectOptions(element("label-assoc-fund-TODO"), "fund-2");

    expect(onApplyCorrection).toHaveBeenCalledWith({
      type: "LinkFund",
      bank_label: "TODO",
      assignment: { type: "Fund", fund_id: "fund-2" },
    });
  });

  it("keeps « Continuer › » off while a label is to link, on once every label is decided", () => {
    const { unmount } = renderScreen();
    expect((element("label-assoc-continue") as HTMLButtonElement).disabled).toBe(true);
    unmount();

    renderScreen({ lines: [KNOWN, NEW, IGNORED], initial: [KNOWN, NEW, IGNORED] });
    expect((element("label-assoc-continue") as HTMLButtonElement).disabled).toBe(false);
    expect(element("label-assoc-continue").textContent).toBe("label_association.continue");
  });

  it("back from the matching, returns there and says which link changed (BAS-066B)", async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    renderScreen({
      lines: [KNOWN, NEW, IGNORED],
      initial: [KNOWN, NEW, IGNORED],
      onContinue,
      linksAtMatching: new Map([
        ["KNOWN", "fund-1"],
        ["NEW", "fund-1"],
        ["IGNORED", null],
      ]),
    });

    expect(element("label-assoc-changed-NEW").textContent).toContain('"count":1');
    expect(document.getElementById("label-assoc-changed-KNOWN")).toBeNull();
    expect(element("label-assoc-continue").textContent).toBe("label_association.back_to_matching");

    await user.click(element("label-assoc-continue"));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("cancels the whole import from « Tout annuler »", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderScreen({ onCancel });

    await user.click(element("label-assoc-cancel"));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
