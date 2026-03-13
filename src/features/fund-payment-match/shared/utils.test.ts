import { describe, expect, it } from "vitest";
import type { PdfParseResult, ReconciliationMatch } from "@/bindings";
import { computePdfDateRange, countTotalAnomalies, sortIssuesByPriority } from "./utils";

function makeParsedData(lines: { start: string; end: string }[]): PdfParseResult {
  return {
    groups: [
      {
        fund_label: "CPAM",
        fund_full_name: "Caisse",
        payment_date: "2025-05-01",
        total_amount: 0,
        is_total_valid: true,
        lines: lines.map((d, i) => ({
          line_index: i,
          payment_date: "2025-05-01",
          invoice_number: `${i}`,
          fund_name: "CPAM",
          patient_name: "Test",
          ssn: "1234567890123",
          nature: "SF",
          procedure_start_date: d.start,
          procedure_end_date: d.end,
          is_period: d.start !== d.end,
          amount: 0,
        })),
      },
    ],
    unparsed_line_count: 0,
    unparsed_lines: [],
  };
}

describe("computePdfDateRange", () => {
  it("returns correct range for a single date", () => {
    expect(
      computePdfDateRange(makeParsedData([{ start: "2025-04-28", end: "2025-04-28" }])),
    ).toEqual({
      start: "2025-04-28",
      end: "2025-04-28",
    });
  });

  it("returns min and max for multiple dates", () => {
    expect(
      computePdfDateRange(
        makeParsedData([
          { start: "2025-04-28", end: "2025-04-28" },
          { start: "2025-02-05", end: "2025-02-05" },
          { start: "2025-03-15", end: "2025-03-15" },
        ]),
      ),
    ).toEqual({
      start: "2025-02-05",
      end: "2025-04-28",
    });
  });

  it("uses both start and end dates for periods", () => {
    expect(
      computePdfDateRange(makeParsedData([{ start: "2025-02-06", end: "2025-02-28" }])),
    ).toEqual({
      start: "2025-02-06",
      end: "2025-02-28",
    });
  });

  it("returns null when no lines", () => {
    expect(computePdfDateRange(makeParsedData([]))).toBeNull();
  });
});

// ─── sortIssuesByPriority ─────────────────────────────────────────────────────

const makePdfLine = (index: number) => ({
  line_index: index,
  payment_date: "2025-05-01",
  invoice_number: `${index}`,
  fund_name: "CPAM",
  patient_name: "Test",
  ssn: "1234567890123",
  nature: "SF",
  procedure_start_date: "2025-05-01",
  procedure_end_date: "2025-05-01",
  is_period: false,
  amount: 10000,
});

const makeDbMatch = (id: string) => ({
  procedure_id: id,
  procedure_date: "2025-05-01",
  fund_id: "fund-1",
  amount: 10000,
  anomalies: [] as string[],
});

describe("sortIssuesByPriority", () => {
  it("puts TooManyMatchIssue first, then others by line_index", () => {
    const matches: ReconciliationMatch[] = [
      {
        type: "TooManyMatchIssue",
        data: { pdf_line: makePdfLine(3), candidate_ids: ["a", "b"] },
      } as ReconciliationMatch,
      {
        type: "SingleMatchIssue",
        data: { pdf_line: makePdfLine(1), db_match: makeDbMatch("p1") },
      } as ReconciliationMatch,
      {
        type: "NotFoundIssue",
        data: { pdf_line: makePdfLine(0), nearby_candidates: [] },
      } as ReconciliationMatch,
      {
        type: "GroupMatchIssue",
        data: { pdf_line: makePdfLine(2), db_matches: [makeDbMatch("p2")] },
      } as ReconciliationMatch,
    ];

    const sorted = sortIssuesByPriority(matches);

    expect(sorted[0]?.type).toBe("TooManyMatchIssue"); // blocking: always first
    expect(sorted[1]?.type).toBe("NotFoundIssue"); // line_index 0
    expect(sorted[2]?.type).toBe("SingleMatchIssue"); // line_index 1
    expect(sorted[3]?.type).toBe("GroupMatchIssue"); // line_index 2
  });

  it("sorts multiple TooManyMatchIssue by line_index among themselves", () => {
    const matches: ReconciliationMatch[] = [
      {
        type: "TooManyMatchIssue",
        data: { pdf_line: makePdfLine(5), candidate_ids: ["a"] },
      } as ReconciliationMatch,
      {
        type: "TooManyMatchIssue",
        data: { pdf_line: makePdfLine(2), candidate_ids: ["b"] },
      } as ReconciliationMatch,
      {
        type: "NotFoundIssue",
        data: { pdf_line: makePdfLine(0), nearby_candidates: [] },
      } as ReconciliationMatch,
    ];

    const sorted = sortIssuesByPriority(matches);

    expect(sorted[0]?.type).toBe("TooManyMatchIssue"); // line_index 2
    expect(sorted[0]?.data.pdf_line.line_index).toBe(2);
    expect(sorted[1]?.type).toBe("TooManyMatchIssue"); // line_index 5
    expect(sorted[1]?.data.pdf_line.line_index).toBe(5);
    expect(sorted[2]?.type).toBe("NotFoundIssue");
  });

  it("excludes PerfectSingleMatch and PerfectGroupMatch", () => {
    const matches: ReconciliationMatch[] = [
      {
        type: "PerfectSingleMatch",
        data: { pdf_line: makePdfLine(0), db_match: makeDbMatch("p0") },
      } as ReconciliationMatch,
      {
        type: "PerfectGroupMatch",
        data: { pdf_line: makePdfLine(1), db_matches: [makeDbMatch("p1")] },
      } as ReconciliationMatch,
      {
        type: "SingleMatchIssue",
        data: { pdf_line: makePdfLine(2), db_match: makeDbMatch("p2") },
      } as ReconciliationMatch,
    ];

    const sorted = sortIssuesByPriority(matches);

    expect(sorted).toHaveLength(1);
    expect(sorted[0]?.type).toBe("SingleMatchIssue");
  });

  it("returns empty array when only perfect matches", () => {
    const matches: ReconciliationMatch[] = [
      {
        type: "PerfectSingleMatch",
        data: { pdf_line: makePdfLine(0), db_match: makeDbMatch("p0") },
      } as ReconciliationMatch,
    ];
    expect(sortIssuesByPriority(matches)).toHaveLength(0);
  });

  it("does not mutate the original array", () => {
    const matches: ReconciliationMatch[] = [
      {
        type: "SingleMatchIssue",
        data: { pdf_line: makePdfLine(0), db_match: makeDbMatch("p0") },
      } as ReconciliationMatch,
      {
        type: "TooManyMatchIssue",
        data: { pdf_line: makePdfLine(1), candidate_ids: ["a"] },
      } as ReconciliationMatch,
    ];
    const original = [...matches];
    sortIssuesByPriority(matches);
    expect(matches[0]?.type).toBe(original[0]?.type);
  });
});

// ─── countTotalAnomalies ──────────────────────────────────────────────────────

describe("countTotalAnomalies", () => {
  it("counts all issue types and ignores perfect matches", () => {
    const matches: ReconciliationMatch[] = [
      {
        type: "PerfectSingleMatch",
        data: { pdf_line: makePdfLine(0), db_match: makeDbMatch("p0") },
      } as ReconciliationMatch,
      {
        type: "SingleMatchIssue",
        data: { pdf_line: makePdfLine(1), db_match: makeDbMatch("p1") },
      } as ReconciliationMatch,
      {
        type: "NotFoundIssue",
        data: { pdf_line: makePdfLine(2), nearby_candidates: [] },
      } as ReconciliationMatch,
      {
        type: "GroupMatchIssue",
        data: { pdf_line: makePdfLine(3), db_matches: [makeDbMatch("p3")] },
      } as ReconciliationMatch,
      {
        type: "TooManyMatchIssue",
        data: { pdf_line: makePdfLine(4), candidate_ids: ["a"] },
      } as ReconciliationMatch,
    ];
    expect(countTotalAnomalies({ matches })).toBe(4);
  });

  it("returns 0 for all perfect matches", () => {
    const matches: ReconciliationMatch[] = [
      {
        type: "PerfectSingleMatch",
        data: { pdf_line: makePdfLine(0), db_match: makeDbMatch("p0") },
      } as ReconciliationMatch,
    ];
    expect(countTotalAnomalies({ matches })).toBe(0);
  });
});
