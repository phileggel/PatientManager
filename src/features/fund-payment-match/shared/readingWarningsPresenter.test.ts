import { describe, expect, it } from "vitest";
import type { NormalizedPdfLine, PdfParseResult, PdfProcedureGroup } from "@/bindings";
import { toReadingWarnings } from "./readingWarningsPresenter";

const line = (amount: number) => ({ amount }) as NormalizedPdfLine;
const group = (overrides: Partial<PdfProcedureGroup>): PdfProcedureGroup =>
  ({
    fund_label: "CPAM n° 931",
    fund_full_name: "CPAM",
    payment_date: "2026-11-12",
    total_amount: 46000,
    is_total_valid: true,
    lines: [line(46000)],
    lines_total: 46000,
    ...overrides,
  }) as PdfProcedureGroup;
const parsed = (overrides: Partial<PdfParseResult>): PdfParseResult => ({
  groups: [group({})],
  unparsed_line_count: 0,
  unparsed_lines: [],
  ...overrides,
});

describe("toReadingWarnings (FPA-020, FPA-030)", () => {
  it("test_662_a_statement_read_whole_has_no_warning", () => {
    expect(toReadingWarnings(parsed({}))).toBeNull();
    expect(toReadingWarnings(null)).toBeNull();
  });

  it("test_662_fpa_020_names_each_group_whose_total_does_not_match_in_pdf_order", () => {
    const warnings = toReadingWarnings(
      parsed({
        groups: [
          group({
            fund_label: "MGEN n° 075",
            total_amount: 184500,
            is_total_valid: false,
            lines_total: 161500,
          }),
          group({}),
          group({
            fund_label: "MSA",
            payment_date: "2026-11-14",
            total_amount: 3000,
            is_total_valid: false,
            lines_total: 2000,
          }),
        ],
      }),
    );

    expect(warnings?.mismatched).toEqual([
      {
        fundLabel: "MGEN n° 075",
        paymentDate: "2026-11-12",
        statedTotal: 184500,
        linesSum: 161500,
      },
      { fundLabel: "MSA", paymentDate: "2026-11-14", statedTotal: 3000, linesSum: 2000 },
    ]);
    expect(warnings?.unparsedCount).toBe(0);
  });

  it("test_662_fpa_030_gives_the_count_and_the_samples_of_unparsed_lines", () => {
    const warnings = toReadingWarnings(
      parsed({ unparsed_line_count: 7, unparsed_lines: ["a", "b", "c", "d", "e"] }),
    );

    expect(warnings).toEqual({
      mismatched: [],
      unparsedCount: 7,
      samples: ["a", "b", "c", "d", "e"],
    });
  });
});
