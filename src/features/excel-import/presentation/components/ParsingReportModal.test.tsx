// Tests for the unified import report (ParsingReportModal).
//
// Per EXI-220 (amended) + EXI-290: parse-time skips and execute-time skips
// share a single flat table with columns Sheet | Row | Reason. The pipeline
// origin is not surfaced separately in the UI.
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import "@/i18n/config";
import i18n from "i18next";
import type { ParsingIssues, SkippedRow } from "@/bindings";
import { ParsingReportModal } from "./ParsingReportModal";

const emptyParsingIssues: ParsingIssues = {
  skipped_rows: [],
  missing_sheets: [],
};

const parsingSkips: ParsingIssues = {
  skipped_rows: [
    { sheet: "Jan", row_number: 3, reason: "amount missing or non-numeric" },
    { sheet: "Fév", row_number: 7, reason: "fund identifier not found in Secu sheet" },
  ],
  missing_sheets: [],
};

const executeSkips: SkippedRow[] = [
  {
    sheet: "Jan",
    row_number: 5,
    reason: "Date d'acte invalide : « 31/12/2026 »",
  },
  {
    sheet: "Fév",
    row_number: 12,
    reason: "La date d'acte 2026-01-15 ne correspond pas au mois de la feuille « Fév »",
  },
];

const defaultProps = {
  isOpen: true,
  onClose: () => {},
  parsingIssues: emptyParsingIssues,
  skippedRowsCount: 0,
};

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("ParsingReportModal — unified title", () => {
  it("uses the unified title `Import report`", () => {
    render(<ParsingReportModal {...defaultProps} executeSkippedRows={[]} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText("Parsing Report")).not.toBeInTheDocument();
    expect(screen.getByText("Import report")).toBeInTheDocument();
  });
});

describe("ParsingReportModal — unified skipped-rows table", () => {
  it("renders execute-time skipped rows when only execute skips are present", () => {
    render(<ParsingReportModal {...defaultProps} executeSkippedRows={executeSkips} />);
    // Section heading carries the merged count
    expect(screen.getByText(/skipped rows \(2\)/i)).toBeInTheDocument();
    // Each reason is rendered verbatim (BE-authored, locale-invariant)
    expect(screen.getByText("Date d'acte invalide : « 31/12/2026 »")).toBeInTheDocument();
    expect(
      screen.getByText("La date d'acte 2026-01-15 ne correspond pas au mois de la feuille « Fév »"),
    ).toBeInTheDocument();
  });

  it("displays source row numbers as cell values", () => {
    render(<ParsingReportModal {...defaultProps} executeSkippedRows={executeSkips} />);
    // Row numbers 5 and 12 in the Row column
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("renders sheet names inline as a column (no tabs)", () => {
    render(<ParsingReportModal {...defaultProps} executeSkippedRows={executeSkips} />);
    // No tab buttons — sheets appear as inline cells in the table
    expect(screen.queryByRole("button", { name: /jan/i })).not.toBeInTheDocument();
    // Sheet cells visible
    const sheetCells = screen.getAllByRole("cell");
    const jansheet = sheetCells.find((c) => c.textContent === "Jan");
    const fevsheet = sheetCells.find((c) => c.textContent === "Fév");
    expect(jansheet).toBeDefined();
    expect(fevsheet).toBeDefined();
  });

  it("renders the Sheet | Row | Reason header row", () => {
    render(<ParsingReportModal {...defaultProps} executeSkippedRows={executeSkips} />);
    expect(screen.getByRole("columnheader", { name: /sheet/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /^row$/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /reason/i })).toBeInTheDocument();
  });

  it("merges parse-time and execute-time skipped rows into one table", () => {
    render(
      <ParsingReportModal
        {...defaultProps}
        parsingIssues={parsingSkips}
        skippedRowsCount={parsingSkips.skipped_rows.length}
        executeSkippedRows={executeSkips}
      />,
    );
    // Merged count = 2 parse + 2 execute = 4
    expect(screen.getByText(/skipped rows \(4\)/i)).toBeInTheDocument();
    // Parse-time reasons render
    expect(screen.getByText("amount missing or non-numeric")).toBeInTheDocument();
    expect(screen.getByText("fund identifier not found in Secu sheet")).toBeInTheDocument();
    // Execute-time reasons render in the SAME table
    expect(screen.getByText("Date d'acte invalide : « 31/12/2026 »")).toBeInTheDocument();
  });

  it("filters out parse-time noise rows (#N/A name, empty row)", () => {
    const noisy: ParsingIssues = {
      skipped_rows: [
        { sheet: "Jan", row_number: 1, reason: "patient name is #N/A" },
        { sheet: "Jan", row_number: 2, reason: "empty row" },
        { sheet: "Jan", row_number: 3, reason: "amount must be > 0" },
      ],
      missing_sheets: [],
    };
    render(
      <ParsingReportModal
        {...defaultProps}
        parsingIssues={noisy}
        skippedRowsCount={noisy.skipped_rows.length}
        executeSkippedRows={[]}
      />,
    );
    // Only the non-noise row renders
    expect(screen.getByText(/skipped rows \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText("amount must be > 0")).toBeInTheDocument();
    expect(screen.queryByText("patient name is #N/A")).not.toBeInTheDocument();
    expect(screen.queryByText("empty row")).not.toBeInTheDocument();
  });

  it("renders the no-issues banner when both lists are empty", () => {
    render(<ParsingReportModal {...defaultProps} executeSkippedRows={[]} />);
    expect(screen.getByText(/no parsing issues detected/i)).toBeInTheDocument();
    // Table heading must NOT appear
    expect(screen.queryByText(/skipped rows \(/i)).not.toBeInTheDocument();
  });
});

describe("ParsingReportModal — missing sheets", () => {
  it("displays missing sheets with the same name as the sheet-selection step (no duplicate label)", () => {
    const issues: ParsingIssues = {
      skipped_rows: [],
      missing_sheets: ["Juin", "Juil", "Août"],
    };
    render(
      <ParsingReportModal
        {...defaultProps}
        parsingIssues={issues}
        skippedRowsCount={0}
        executeSkippedRows={[]}
      />,
    );
    // Each entry rendered ONCE via t("sheetSelection.sheets.${sheet}") — no canonical+full pair
    expect(screen.getByText("June")).toBeInTheDocument();
    expect(screen.getByText("July")).toBeInTheDocument();
    expect(screen.getByText("August")).toBeInTheDocument();
    // The canonical short forms must not appear as separate adjacent labels
    expect(screen.queryByText("Juin")).not.toBeInTheDocument();
    expect(screen.queryByText("Juil")).not.toBeInTheDocument();
  });
});
