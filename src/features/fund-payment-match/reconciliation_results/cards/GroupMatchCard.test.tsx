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

function renderCard(accepted: Map<string, AutoCorrection>) {
  const onAcceptCorrection = vi.fn();
  const onUnacceptCorrection = vi.fn();
  render(
    <GroupMatchCard
      pdfLine={pdfLine}
      dbMatches={dbMatches}
      acceptedKeys={new Set(accepted.keys())}
      autoCorrections={accepted}
      onAcceptCorrection={onAcceptCorrection}
      onUnacceptCorrection={onUnacceptCorrection}
    />,
  );
  return { onAcceptCorrection, onUnacceptCorrection };
}

// #392 (FPA-141A, FPA-141B, FPA-141C): disputing a group records the typed amounts as paid and keeps
// the billed amounts — the typed amount corrections are dropped.
describe("GroupMatchCard — dispute (#392)", () => {
  it("drops the typed amount corrections and records each typed amount as paid", () => {
    const { onAcceptCorrection, onUnacceptCorrection } = renderCard(
      new Map<string, AutoCorrection>([
        [
          "AmountMismatch-proc-a",
          { AmountMismatch: { procedure_id: "proc-a", pdf_amount: 30000 } },
        ],
      ]),
    );

    fireEvent.click(screen.getByRole("button", { name: /contest/i }));

    expect(onUnacceptCorrection).toHaveBeenCalledWith([
      "AmountMismatch-proc-a",
      "AmountMismatch-proc-b",
    ]);
    expect(onAcceptCorrection).toHaveBeenCalledWith("ContestAmount-proc-a", {
      ContestAmount: { procedure_id: "proc-a", paid_amount: 30000 },
    });
    expect(onAcceptCorrection).toHaveBeenCalledWith("ContestAmount-proc-b", {
      ContestAmount: { procedure_id: "proc-b", paid_amount: 40000 },
    });
    expect(onAcceptCorrection).not.toHaveBeenCalledWith(
      expect.stringMatching(/^AmountMismatch-/),
      expect.anything(),
    );
  });

  it("changes the paid amount, not the billed one, when an amount is typed after the dispute", () => {
    const { onAcceptCorrection } = renderCard(
      new Map<string, AutoCorrection>([
        ["ContestAmount-proc-a", { ContestAmount: { procedure_id: "proc-a", paid_amount: 30000 } }],
        ["ContestAmount-proc-b", { ContestAmount: { procedure_id: "proc-b", paid_amount: 20000 } }],
      ]),
    );

    fireEvent.change(document.getElementById("amount-proc-a") as HTMLInputElement, {
      target: { value: "25" },
    });

    expect(onAcceptCorrection).toHaveBeenCalledWith("ContestAmount-proc-a", {
      ContestAmount: { procedure_id: "proc-a", paid_amount: 25000 },
    });
    expect(onAcceptCorrection).not.toHaveBeenCalledWith("AmountMismatch-proc-a", expect.anything());
  });
});

describe("GroupMatchCard — validate distribution after a dispute (#392)", () => {
  it("stages the other anomalies but no amount correction on a disputed procedure", () => {
    const onAcceptCorrection = vi.fn();
    const withDate: DbMatch[] = [
      { ...dbMatches[0], anomalies: ["AmountMismatch", "DateMismatch"] } as DbMatch,
      dbMatches[1] as DbMatch,
    ];
    const accepted = new Map<string, AutoCorrection>([
      ["ContestAmount-proc-a", { ContestAmount: { procedure_id: "proc-a", paid_amount: 30000 } }],
      ["ContestAmount-proc-b", { ContestAmount: { procedure_id: "proc-b", paid_amount: 30000 } }],
    ]);
    render(
      <GroupMatchCard
        pdfLine={pdfLine}
        dbMatches={withDate}
        acceptedKeys={new Set(accepted.keys())}
        autoCorrections={accepted}
        onAcceptCorrection={onAcceptCorrection}
        onUnacceptCorrection={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /distribution/i }));

    expect(onAcceptCorrection).toHaveBeenCalledWith("DateMismatch-proc-a", expect.anything());
    expect(onAcceptCorrection).not.toHaveBeenCalledWith(
      expect.stringMatching(/^AmountMismatch-/),
      expect.anything(),
    );
  });
});
