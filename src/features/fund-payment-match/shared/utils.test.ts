import { describe, expect, it } from "vitest";
import type {
  AnomalyType,
  NormalizedPdfLine,
  PdfParseResult,
  ReconciliationMatch,
} from "@/bindings";
import {
  buildAutoCorrection,
  buildContestCorrection,
  buildContestKey,
  buildCorrectionKey,
  buildLinkProcedureCorrection,
  buildLinkProcedureKey,
  buildNotFoundCorrection,
  buildNotFoundKey,
  computePdfDateRange,
  correctionKeysForMatch,
  countTotalAnomalies,
  sortIssuesByPriority,
} from "./utils";

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
  anomalies: [] as AnomalyType[],
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

// ─── Key builders ─────────────────────────────────────────────────────────────

describe("key builders", () => {
  it("buildCorrectionKey combines anomaly and procedureId", () => {
    expect(buildCorrectionKey("AmountMismatch", "p-1")).toBe("AmountMismatch-p-1");
  });

  it("buildNotFoundKey uses line_index", () => {
    const line = { line_index: 3 } as NormalizedPdfLine;
    expect(buildNotFoundKey(line)).toBe("CreateProcedure-3");
  });

  it("buildLinkProcedureKey scopes the key by line index and procedureId (#61)", () => {
    expect(buildLinkProcedureKey(0, "p-42")).toBe("LinkProcedure-0-p-42");
    // Same procedure under a different line yields a distinct key, so linking
    // it for one line never marks a sibling line resolved.
    expect(buildLinkProcedureKey(1, "p-42")).toBe("LinkProcedure-1-p-42");
  });

  it("buildContestKey uses procedureId", () => {
    expect(buildContestKey("p-99")).toBe("ContestAmount-p-99");
  });
});

// ─── Correction factories ─────────────────────────────────────────────────────

const line = makePdfLine(0);
const dbMatch = makeDbMatch("p-1");

describe("buildAutoCorrection", () => {
  it("builds AmountMismatch correction with pdf_amount from pdfLine", () => {
    const result = buildAutoCorrection("AmountMismatch", line, dbMatch);
    expect(result).toEqual({ AmountMismatch: { procedure_id: "p-1", pdf_amount: 10000 } });
  });

  it("builds AmountMismatch correction with customAmount override", () => {
    const result = buildAutoCorrection("AmountMismatch", line, dbMatch, 99000);
    expect(result).toEqual({ AmountMismatch: { procedure_id: "p-1", pdf_amount: 99000 } });
  });

  it("builds FundMismatch correction", () => {
    const result = buildAutoCorrection("FundMismatch", line, dbMatch);
    expect(result).toEqual({ FundMismatch: { procedure_id: "p-1", pdf_fund_label: "CPAM" } });
  });

  it("builds DateMismatch correction", () => {
    const result = buildAutoCorrection("DateMismatch", line, dbMatch);
    expect(result).toEqual({ DateMismatch: { procedure_id: "p-1", pdf_date: "2025-05-01" } });
  });

  it("throws for unknown anomaly type", () => {
    expect(() => buildAutoCorrection("Unknown", line, dbMatch)).toThrow(
      "Unknown anomaly type: Unknown",
    );
  });
});

describe("buildLinkProcedureCorrection", () => {
  it("builds LinkProcedure correction from candidate and pdfLine", () => {
    const candidate = { procedure_id: "p-2" } as Parameters<typeof buildLinkProcedureCorrection>[0];
    const result = buildLinkProcedureCorrection(candidate, line);
    expect(result).toEqual({
      LinkProcedure: {
        procedure_id: "p-2",
        pdf_ssn: "1234567890123",
        pdf_fund_label: "CPAM",
        payment_date: "2025-05-01",
      },
    });
  });
});

describe("buildContestCorrection", () => {
  it("builds ContestAmount correction", () => {
    expect(buildContestCorrection("p-3", 20000)).toEqual({
      ContestAmount: { procedure_id: "p-3", paid_amount: 20000 },
    });
  });
});

describe("buildNotFoundCorrection", () => {
  it("builds CreateProcedure correction from pdfLine", () => {
    const result = buildNotFoundCorrection(line);
    expect(result).toEqual({
      CreateProcedure: {
        ssn: "1234567890123",
        patient_name: "Test",
        procedure_date: "2025-05-01",
        payment_date: "2025-05-01",
        billed_amount: 10000,
        pdf_fund_label: "CPAM",
      },
    });
  });
});

describe("correctionKeysForMatch", () => {
  it("returns per-anomaly + contest keys for a SingleMatchIssue", () => {
    const match = {
      type: "SingleMatchIssue",
      data: {
        pdf_line: makePdfLine(0),
        db_match: { ...makeDbMatch("p1"), anomalies: ["AmountMismatch", "DateMismatch"] },
      },
    } as ReconciliationMatch;
    expect(correctionKeysForMatch(match)).toEqual([
      "AmountMismatch-p1",
      "DateMismatch-p1",
      "ContestAmount-p1",
    ]);
  });

  it("returns create + per-candidate link keys for a NotFoundIssue", () => {
    const match = {
      type: "NotFoundIssue",
      data: {
        pdf_line: makePdfLine(2),
        nearby_candidates: [
          {
            procedure_id: "p-near",
            patient_name: "X",
            ssn: "1",
            procedure_date: "2025-05-01",
            amount: 1,
          },
        ],
      },
    } as ReconciliationMatch;
    expect(correctionKeysForMatch(match)).toEqual(["CreateProcedure-2", "LinkProcedure-2-p-near"]);
  });

  it("returns deduped amount/contest keys per match for a GroupMatchIssue", () => {
    const match = {
      type: "GroupMatchIssue",
      data: {
        pdf_line: makePdfLine(0),
        db_matches: [
          { ...makeDbMatch("p1"), anomalies: ["AmountMismatch"] },
          { ...makeDbMatch("p2"), anomalies: ["DateMismatch"] },
        ],
      },
    } as ReconciliationMatch;
    // p1's AmountMismatch appears via both the anomaly map and the always-staged
    // amount key — deduped to a single entry.
    expect(correctionKeysForMatch(match)).toEqual([
      "AmountMismatch-p1",
      "ContestAmount-p1",
      "DateMismatch-p2",
      "AmountMismatch-p2",
      "ContestAmount-p2",
    ]);
  });

  it("returns no keys for an unresolvable TooManyMatchIssue", () => {
    const match = {
      type: "TooManyMatchIssue",
      data: { pdf_line: makePdfLine(0), candidate_ids: ["a", "b"] },
    } as ReconciliationMatch;
    expect(correctionKeysForMatch(match)).toEqual([]);
  });
});
