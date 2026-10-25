import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AutoCorrection, DbMatch, NormalizedPdfLine } from "@/bindings";
import { GroupMatchCard } from "./GroupMatchCard";

const pdfLine: NormalizedPdfLine = {
  line_index: 1,
  payment_date: "2026-01-15",
  invoice_number: "INV-1",
  fund_name: "CPAM 75",
  patient_name: "DOE JOHN",
  ssn: "1234567890123",
  nature: "SF",
  procedure_start_date: "2026-01-10",
  procedure_end_date: "2026-01-14",
  is_period: true,
  amount: 60000,
};

const dbMatches: DbMatch[] = [
  {
    procedure_id: "proc-a",
    procedure_date: "2026-01-10",
    fund_id: "fund-1",
    amount: 40000,
    anomalies: ["AmountMismatch"],
  },
  {
    procedure_id: "proc-b",
    procedure_date: "2026-01-14",
    fund_id: "fund-1",
    amount: 40000,
    anomalies: ["AmountMismatch"],
  },
];

const amountCorrection = (id: string, amount: number): AutoCorrection => ({
  AmountMismatch: { procedure_id: id, pdf_amount: amount },
});
const dispute = (id: string, paid: number): AutoCorrection => ({
  DisputeAmount: { procedure_id: id, paid_amount: paid },
});

// `staged` are the typed values; `accepted` the keys among them that are accepted (all by default).
function renderCard(
  staged: Map<string, AutoCorrection>,
  {
    line = pdfLine,
    matches = dbMatches,
    accepted = new Set(staged.keys()),
  }: { line?: NormalizedPdfLine; matches?: DbMatch[]; accepted?: Set<string> } = {},
) {
  const onAcceptCorrection = vi.fn();
  const onStageCorrection = vi.fn();
  const onUnacceptCorrection = vi.fn();
  render(
    <GroupMatchCard
      pdfLine={line}
      dbMatches={matches}
      acceptedKeys={accepted}
      autoCorrections={staged}
      onAcceptCorrection={onAcceptCorrection}
      onStageCorrection={onStageCorrection}
      onUnacceptCorrection={onUnacceptCorrection}
    />,
  );
  return { onAcceptCorrection, onStageCorrection, onUnacceptCorrection };
}

const typeAmount = (procedureId: string, value: string) =>
  fireEvent.change(document.getElementById(`amount-${procedureId}`) as HTMLInputElement, {
    target: { value },
  });
const choice = (kind: "correct" | "dispute", procedureId: string) =>
  document.getElementById(`fund-payment-match-group-${kind}-${procedureId}`) as HTMLButtonElement;
const validateButton = () =>
  document.getElementById("fund-payment-match-group-validate") as HTMLButtonElement;

// Typed 30 + 30 for a 60 line, both procedures billed 40.
const typedBelow = (accepted: string[] = []) => ({
  staged: new Map<string, AutoCorrection>([
    ["AmountMismatch-proc-a", amountCorrection("proc-a", 30000)],
    ["AmountMismatch-proc-b", amountCorrection("proc-b", 30000)],
  ]),
  accepted: new Set(accepted),
});

// Ticket #422 (FPA-141): a procedure paid less asks for a choice, nothing chosen by default.
describe("GroupMatchCard — a procedure paid less asks for a choice (FPA-141)", () => {
  it("shows each procedure's billed amount", () => {
    renderCard(new Map());

    expect(screen.getAllByText(/^Billed .*40/)).toHaveLength(2);
  });

  it("offers no choice while the typed amount equals the billed amount", () => {
    renderCard(new Map());

    expect(choice("correct", "proc-a")).toBeNull();
    expect(choice("dispute", "proc-a")).toBeNull();
  });

  it("offers correct and dispute, neither chosen, once the typed amount is below the billed one", () => {
    const { staged, accepted } = typedBelow();
    renderCard(staged, { accepted });

    expect(choice("correct", "proc-a")).toHaveAttribute("aria-pressed", "false");
    expect(choice("dispute", "proc-a")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByText(/^Paid .*10.*less$/)).toHaveLength(2);
  });

  it("offers no group-wide dispute", () => {
    const { staged, accepted } = typedBelow();
    renderCard(staged, { accepted });

    expect(screen.queryByRole("button", { name: /contest \(/i })).not.toBeInTheDocument();
  });
});

// Ticket #422 (FPA-141A): correcting or disputing one procedure.
describe("GroupMatchCard — correct or dispute a procedure (FPA-141A)", () => {
  it("stages an amount typed below the billed one without accepting it", () => {
    const { onAcceptCorrection, onStageCorrection } = renderCard(new Map());

    typeAmount("proc-a", "30");

    expect(onStageCorrection).toHaveBeenCalledWith(
      "AmountMismatch-proc-a",
      amountCorrection("proc-a", 30000),
    );
    expect(onAcceptCorrection).not.toHaveBeenCalled();
  });

  it("accepts the amount correction when the user corrects", () => {
    const { staged, accepted } = typedBelow();
    const { onAcceptCorrection } = renderCard(staged, { accepted });

    fireEvent.click(choice("correct", "proc-a"));

    expect(onAcceptCorrection).toHaveBeenCalledWith(
      "AmountMismatch-proc-a",
      amountCorrection("proc-a", 30000),
    );
  });

  it("replaces the amount correction with a dispute of the typed amount when the user disputes", () => {
    const { staged, accepted } = typedBelow();
    const { onAcceptCorrection, onUnacceptCorrection } = renderCard(staged, { accepted });

    fireEvent.click(choice("dispute", "proc-a"));

    expect(onUnacceptCorrection).toHaveBeenCalledWith(["AmountMismatch-proc-a"]);
    expect(onAcceptCorrection).toHaveBeenCalledWith(
      "DisputeAmount-proc-a",
      dispute("proc-a", 30000),
    );
  });

  it("shows the choice made", () => {
    renderCard(
      new Map<string, AutoCorrection>([
        ["AmountMismatch-proc-a", amountCorrection("proc-a", 30000)],
        ["DisputeAmount-proc-b", dispute("proc-b", 30000)],
      ]),
    );

    expect(choice("correct", "proc-a")).toHaveAttribute("aria-pressed", "true");
    expect(choice("dispute", "proc-b")).toHaveAttribute("aria-pressed", "true");
  });
});

// Ticket #422 (FPA-141B): an amount typed after a choice.
describe("GroupMatchCard — an amount typed after a choice (FPA-141B)", () => {
  it("changes the paid amount, not the billed one, of a disputed procedure", () => {
    const { onAcceptCorrection } = renderCard(
      new Map<string, AutoCorrection>([["DisputeAmount-proc-a", dispute("proc-a", 30000)]]),
    );

    typeAmount("proc-a", "25");

    expect(onAcceptCorrection).toHaveBeenCalledWith(
      "DisputeAmount-proc-a",
      dispute("proc-a", 25000),
    );
    expect(onAcceptCorrection).not.toHaveBeenCalledWith("AmountMismatch-proc-a", expect.anything());
  });

  it("keeps a corrected procedure corrected", () => {
    const { staged } = typedBelow();
    const { onAcceptCorrection, onStageCorrection } = renderCard(staged, {
      accepted: new Set(["AmountMismatch-proc-a"]),
    });

    typeAmount("proc-a", "25");

    expect(onAcceptCorrection).toHaveBeenCalledWith(
      "AmountMismatch-proc-a",
      amountCorrection("proc-a", 25000),
    );
    expect(onStageCorrection).not.toHaveBeenCalled();
  });

  it("clears a dispute and corrects once the amount reaches the billed one", () => {
    const { onAcceptCorrection, onUnacceptCorrection } = renderCard(
      new Map<string, AutoCorrection>([["DisputeAmount-proc-a", dispute("proc-a", 30000)]]),
    );

    typeAmount("proc-a", "45");

    expect(onUnacceptCorrection).toHaveBeenCalledWith(["DisputeAmount-proc-a"]);
    expect(onAcceptCorrection).toHaveBeenCalledWith(
      "AmountMismatch-proc-a",
      amountCorrection("proc-a", 45000),
    );
  });

  it("asks again when an amount at or above the billed one drops below it", () => {
    const { onAcceptCorrection, onStageCorrection } = renderCard(
      new Map<string, AutoCorrection>([
        ["AmountMismatch-proc-a", amountCorrection("proc-a", 45000)],
      ]),
    );

    typeAmount("proc-a", "30");

    expect(onStageCorrection).toHaveBeenCalledWith(
      "AmountMismatch-proc-a",
      amountCorrection("proc-a", 30000),
    );
    expect(onAcceptCorrection).not.toHaveBeenCalled();
  });
});

// Ticket #422 (FPA-141C): "Validate distribution" waits for the total and every choice.
describe("GroupMatchCard — validate distribution (FPA-141C)", () => {
  const withDate: DbMatch[] = [
    { ...dbMatches[0], anomalies: ["AmountMismatch", "DateMismatch"] } as DbMatch,
    dbMatches[1] as DbMatch,
  ];

  it("is disabled while a procedure paid less has no choice", () => {
    const { staged } = typedBelow();
    renderCard(staged, { accepted: new Set(["AmountMismatch-proc-a"]) });

    expect(validateButton()).toBeDisabled();
  });

  it("is disabled while the total does not equal the PDF amount", () => {
    renderCard(
      new Map<string, AutoCorrection>([
        ["AmountMismatch-proc-a", amountCorrection("proc-a", 30000)],
        ["DisputeAmount-proc-b", dispute("proc-b", 20000)],
      ]),
      { matches: withDate },
    );

    expect(validateButton()).toBeDisabled();
  });

  it("accepts the date difference, and no amount correction for a disputed procedure", () => {
    const { onAcceptCorrection } = renderCard(
      new Map<string, AutoCorrection>([
        ["DisputeAmount-proc-a", dispute("proc-a", 30000)],
        ["AmountMismatch-proc-b", amountCorrection("proc-b", 30000)],
      ]),
      { matches: withDate },
    );

    expect(validateButton()).toBeEnabled();
    fireEvent.click(validateButton());

    expect(onAcceptCorrection).toHaveBeenCalledWith("DateMismatch-proc-a", expect.anything());
    expect(onAcceptCorrection).not.toHaveBeenCalledWith("AmountMismatch-proc-a", expect.anything());
  });
});

// Ticket #422 (FPA-141D): a disputed procedure counts with its paid amount.
describe("GroupMatchCard — a disputed group resolves once its amounts add up (FPA-141D)", () => {
  it("stays unresolved while the paid amounts do not add up to the PDF amount", () => {
    renderCard(
      new Map<string, AutoCorrection>([
        ["DisputeAmount-proc-a", dispute("proc-a", 25000)],
        ["DisputeAmount-proc-b", dispute("proc-b", 25000)],
      ]),
    );

    expect(screen.queryByText("Resolved")).not.toBeInTheDocument();
  });

  it("is resolved once the paid amounts add up to the PDF amount", () => {
    renderCard(
      new Map<string, AutoCorrection>([
        ["DisputeAmount-proc-a", dispute("proc-a", 30000)],
        ["DisputeAmount-proc-b", dispute("proc-b", 30000)],
      ]),
    );

    expect(screen.getByText("Resolved")).toBeInTheDocument();
  });
});

// FPA-140 (ticket #464): each procedure shows its date and fund differences as chips.
describe("GroupMatchCard — date and fund chips (FPA-140)", () => {
  it("shows a chip for each date or fund difference, none for the amount", () => {
    renderCard(new Map(), {
      matches: [
        { ...dbMatches[0], anomalies: ["AmountMismatch", "DateMismatch"] } as DbMatch,
        { ...dbMatches[1], anomalies: ["AmountMismatch", "FundMismatch"] } as DbMatch,
      ],
    });

    expect(screen.getByText("Date mismatch")).toBeInTheDocument();
    expect(screen.getByText("Fund mismatch")).toBeInTheDocument();
    expect(screen.queryByText("Amount mismatch")).not.toBeInTheDocument();
  });
});
