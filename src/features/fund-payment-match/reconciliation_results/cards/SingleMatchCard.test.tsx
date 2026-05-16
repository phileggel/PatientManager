import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DbMatch, NormalizedPdfLine } from "@/bindings";
import { SingleMatchCard } from "./SingleMatchCard";

const pdfLine: NormalizedPdfLine = {
  line_index: 1,
  payment_date: "2026-01-15",
  invoice_number: "INV-1",
  fund_name: "CPAM 75",
  patient_name: "DOE JOHN",
  ssn: "1234567890123",
  nature: "SF",
  procedure_start_date: "2026-01-15",
  procedure_end_date: "2026-01-15",
  is_period: false,
  amount: 5000,
};

const dbMatchDateMismatch: DbMatch = {
  procedure_id: "proc-1",
  procedure_date: "2026-01-14",
  fund_id: "fund-1",
  amount: 5000,
  anomalies: ["DateMismatch"],
};

const dbMatchAmountMismatch: DbMatch = {
  procedure_id: "proc-2",
  procedure_date: "2026-01-15",
  fund_id: "fund-1",
  amount: 7500,
  anomalies: ["AmountMismatch"],
};

const baseProps = {
  pdfLine,
  acceptedKeys: new Set<string>(),
  autoCorrections: new Map(),
  onAcceptCorrection: vi.fn(),
};

describe("SingleMatchCard — DateMismatch comparison row", () => {
  it("renders both PDF and DB dates as locale-aware short dates, never raw ISO", () => {
    render(<SingleMatchCard {...baseProps} dbMatch={dbMatchDateMismatch} />);

    // Locale-aware output (en-GB at test setup → dd/mm/yyyy). The PDF date
    // also appears in the PdfSummary header, so it can show up twice.
    expect(screen.getAllByText("15/01/2026").length).toBeGreaterThan(0);
    expect(screen.getByText("14/01/2026")).toBeInTheDocument();

    // No raw ISO leaks
    expect(screen.queryByText("2026-01-15")).not.toBeInTheDocument();
    expect(screen.queryByText("2026-01-14")).not.toBeInTheDocument();
  });
});

describe("SingleMatchCard — AmountMismatch comparison row", () => {
  it("renders both PDF and DB amounts as locale-aware currency, never raw thousandths or bare numbers", () => {
    render(<SingleMatchCard {...baseProps} dbMatch={dbMatchAmountMismatch} />);

    // en-GB at test setup → "€5.00" / "€7.50". The PDF amount also appears
    // in the PdfSummary header, so it can show up twice.
    expect(screen.getAllByText("€5.00").length).toBeGreaterThan(0);
    expect(screen.getByText("€7.50")).toBeInTheDocument();

    // No raw thousandths or bare-number leaks
    expect(screen.queryByText("5000")).not.toBeInTheDocument();
    expect(screen.queryByText("7500")).not.toBeInTheDocument();
    expect(screen.queryByText("5.00 €")).not.toBeInTheDocument();
    expect(screen.queryByText("7.50 €")).not.toBeInTheDocument();
  });
});
