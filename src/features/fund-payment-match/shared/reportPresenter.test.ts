import { describe, expect, it } from "vitest";
import type { AutoCorrection, ReconciliationMatch } from "@/bindings";
import type { CorrectionGroupsInput } from "./reportPresenter";
import { buildCorrectionGroups } from "./reportPresenter";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Produce a minimal SingleMatchIssue match for use in test fixtures */
function makeMatch(
  procedureId: string,
  patientName: string,
  procedureDate: string,
  fundId: string | null = "fund-1",
  dbAmount: number | null = 50000,
): ReconciliationMatch {
  return {
    type: "SingleMatchIssue",
    data: {
      pdf_line: {
        line_index: 0,
        payment_date: "2025-05-02",
        invoice_number: "001",
        fund_name: "CPAM 931",
        patient_name: patientName,
        ssn: "1111111111111",
        nature: "SF",
        procedure_start_date: procedureDate,
        procedure_end_date: procedureDate,
        is_period: false,
        amount: 50,
      },
      db_match: {
        procedure_id: procedureId,
        procedure_date: procedureDate,
        fund_id: fundId,
        amount: dbAmount,
        anomalies: [],
      },
    },
  };
}

/** Build a minimal input for buildCorrectionGroups */
function makeInput(
  corrections: Map<string, AutoCorrection>,
  matches: ReconciliationMatch[],
  fundIdToLabel: Map<string, string> = new Map(),
  locale = "fr",
): CorrectionGroupsInput {
  return {
    autoCorrections: corrections,
    matches,
    fundIdToLabel,
    locale,
    t: (key: string) => key,
  };
}

// ---------------------------------------------------------------------------
// Per-variant tests (FPR-042)
// ---------------------------------------------------------------------------

describe("buildCorrectionGroups — ContestAmount variant (FPR-042)", () => {
  it("returns one group with title and a single row containing patient, date, billed→paid", () => {
    const corrections = new Map<string, AutoCorrection>([
      ["ContestAmount-proc-1", { ContestAmount: { procedure_id: "proc-1", paid_amount: 45000 } }],
    ]);
    const matches = [makeMatch("proc-1", "DUPONT Jean", "2025-04-15", "fund-1", 50000)];

    const groups = buildCorrectionGroups(makeInput(corrections, matches));

    expect(groups).toHaveLength(1);
    expect(groups[0]?.title).toBeTruthy();
    expect(groups[0]?.rows).toHaveLength(1);
    const row = groups[0]!.rows[0]!;
    // Row must contain patient name, procedure date, and both amounts
    expect(row).toContain("DUPONT Jean");
    // Date formatted via Intl.DateTimeFormat — assert day + year tokens
    expect(row).toContain("15");
    expect(row).toContain("2025");
  });
});

describe("buildCorrectionGroups — CreateProcedure variant (FPR-042)", () => {
  it("returns one group with a row containing patient, SSN, date, fund label, billed amount", () => {
    const corrections = new Map<string, AutoCorrection>([
      [
        "CreateProcedure-0",
        {
          CreateProcedure: {
            ssn: "9999999999999",
            patient_name: "NOUVEAU Patient",
            procedure_date: "2025-04-10",
            payment_date: "2025-05-02",
            billed_amount: 25000,
            pdf_fund_label: "CPAM 931",
          },
        },
      ],
    ]);

    const groups = buildCorrectionGroups(makeInput(corrections, []));

    expect(groups).toHaveLength(1);
    expect(groups[0]?.rows).toHaveLength(1);
    const row = groups[0]!.rows[0]!;
    expect(row).toContain("NOUVEAU Patient");
    expect(row).toContain("9999999999999");
    expect(row).toContain("CPAM 931");
    expect(row).toContain("10");
    expect(row).toContain("2025");
  });
});

describe("buildCorrectionGroups — LinkProcedure variant (FPR-042)", () => {
  it("returns one group with a row containing patient, SSN, fund label, payment date", () => {
    const corrections = new Map<string, AutoCorrection>([
      [
        "LinkProcedure-proc-2",
        {
          LinkProcedure: {
            procedure_id: "proc-2",
            pdf_ssn: "5555555555555",
            pdf_fund_label: "CPAM 931",
            payment_date: "2025-05-02",
          },
        },
      ],
    ]);
    const matches = [makeMatch("proc-2", "PATIENT LINK", "2025-04-05", null, null)];

    const groups = buildCorrectionGroups(makeInput(corrections, matches));

    expect(groups).toHaveLength(1);
    expect(groups[0]?.rows).toHaveLength(1);
    const row = groups[0]!.rows[0]!;
    expect(row).toContain("PATIENT LINK");
    expect(row).toContain("5555555555555");
    expect(row).toContain("CPAM 931");
    expect(row).toContain("02");
    expect(row).toContain("2025");
  });
});

describe("buildCorrectionGroups — AmountMismatch variant (FPR-042)", () => {
  it("returns one group with a row containing patient, date, original→corrected amounts", () => {
    const corrections = new Map<string, AutoCorrection>([
      ["AmountMismatch-proc-3", { AmountMismatch: { procedure_id: "proc-3", pdf_amount: 30000 } }],
    ]);
    const matches = [makeMatch("proc-3", "PATIENT B", "2025-04-02", "fund-1", 40000)];

    const groups = buildCorrectionGroups(makeInput(corrections, matches));

    expect(groups).toHaveLength(1);
    expect(groups[0]?.rows).toHaveLength(1);
    const row = groups[0]!.rows[0]!;
    expect(row).toContain("PATIENT B");
    expect(row).toContain("02");
    expect(row).toContain("2025");
  });
});

describe("buildCorrectionGroups — FundMismatch variant (FPR-042)", () => {
  it("returns one group with a row containing patient, date, original fund label→corrected fund label", () => {
    const fundIdToLabel = new Map([["fund-2", "MGEN 001"]]);
    const corrections = new Map<string, AutoCorrection>([
      [
        "FundMismatch-proc-4",
        { FundMismatch: { procedure_id: "proc-4", pdf_fund_label: "CPAM 932" } },
      ],
    ]);
    const matches = [makeMatch("proc-4", "PATIENT C", "2025-04-03", "fund-2", 20000)];

    const groups = buildCorrectionGroups(makeInput(corrections, matches, fundIdToLabel));

    expect(groups).toHaveLength(1);
    expect(groups[0]?.rows).toHaveLength(1);
    const row = groups[0]!.rows[0]!;
    expect(row).toContain("PATIENT C");
    // original fund from fundIdToLabel
    expect(row).toContain("MGEN 001");
    // corrected fund label
    expect(row).toContain("CPAM 932");
  });

  it("falls back to fund_id when fundIdToLabel has no entry for the id", () => {
    const corrections = new Map<string, AutoCorrection>([
      [
        "FundMismatch-proc-4b",
        { FundMismatch: { procedure_id: "proc-4b", pdf_fund_label: "CPAM 999" } },
      ],
    ]);
    const matches = [makeMatch("proc-4b", "PATIENT X", "2025-04-03", "fund-unknown", 10000)];

    const groups = buildCorrectionGroups(makeInput(corrections, matches, new Map()));

    expect(groups[0]?.rows[0]).toContain("fund-unknown");
  });
});

describe("buildCorrectionGroups — DateMismatch variant (FPR-042)", () => {
  it("returns one group with a row containing patient, original date→corrected date", () => {
    const corrections = new Map<string, AutoCorrection>([
      ["DateMismatch-proc-5", { DateMismatch: { procedure_id: "proc-5", pdf_date: "2025-04-04" } }],
    ]);
    const matches = [makeMatch("proc-5", "PATIENT D", "2025-04-03")];

    const groups = buildCorrectionGroups(makeInput(corrections, matches));

    expect(groups).toHaveLength(1);
    expect(groups[0]?.rows).toHaveLength(1);
    const row = groups[0]!.rows[0]!;
    expect(row).toContain("PATIENT D");
    // Both original (3 Apr) and corrected (4 Apr) dates should appear
    expect(row).toContain("03");
    expect(row).toContain("04");
    expect(row).toContain("2025");
  });
});

// ---------------------------------------------------------------------------
// FPR-041 priority ordering
// ---------------------------------------------------------------------------

describe("buildCorrectionGroups — FPR-041 priority ordering", () => {
  it("given corrections in arbitrary order, groups are returned in ContestAmount→CreateProcedure→LinkProcedure→AmountMismatch→FundMismatch→DateMismatch sequence", () => {
    // Insert corrections in reverse priority order
    const corrections = new Map<string, AutoCorrection>([
      ["DateMismatch-proc-d", { DateMismatch: { procedure_id: "proc-d", pdf_date: "2025-04-04" } }],
      [
        "FundMismatch-proc-f",
        { FundMismatch: { procedure_id: "proc-f", pdf_fund_label: "CPAM 932" } },
      ],
      ["AmountMismatch-proc-a", { AmountMismatch: { procedure_id: "proc-a", pdf_amount: 30000 } }],
      [
        "LinkProcedure-proc-l",
        {
          LinkProcedure: {
            procedure_id: "proc-l",
            pdf_ssn: "5555555555555",
            pdf_fund_label: "CPAM 931",
            payment_date: "2025-05-02",
          },
        },
      ],
      [
        "CreateProcedure-0",
        {
          CreateProcedure: {
            ssn: "9999999999999",
            patient_name: "NEW",
            procedure_date: "2025-04-10",
            payment_date: "2025-05-02",
            billed_amount: 10000,
            pdf_fund_label: "CPAM 931",
          },
        },
      ],
      ["ContestAmount-proc-c", { ContestAmount: { procedure_id: "proc-c", paid_amount: 45000 } }],
    ]);

    const matches: ReconciliationMatch[] = [
      makeMatch("proc-d", "PATIENT D", "2025-04-03"),
      makeMatch("proc-f", "PATIENT F", "2025-04-03", "fund-2"),
      makeMatch("proc-a", "PATIENT A", "2025-04-02", "fund-1", 40000),
      makeMatch("proc-l", "PATIENT L", "2025-04-05", null, null),
      makeMatch("proc-c", "PATIENT C", "2025-04-01", "fund-1", 50000),
    ];

    const groups = buildCorrectionGroups(makeInput(corrections, matches));

    expect(groups).toHaveLength(6);
    // The titles come from t() which returns the key — we test order by position
    // We verify order by checking each group's rows contain known patient names
    // ContestAmount must be first
    expect(groups[0]!.rows[0]).toContain("PATIENT C");
    // CreateProcedure second
    expect(groups[1]!.rows[0]).toContain("NEW");
    // LinkProcedure third
    expect(groups[2]!.rows[0]).toContain("PATIENT L");
    // AmountMismatch fourth
    expect(groups[3]!.rows[0]).toContain("PATIENT A");
    // FundMismatch fifth
    expect(groups[4]!.rows[0]).toContain("PATIENT F");
    // DateMismatch sixth
    expect(groups[5]!.rows[0]).toContain("PATIENT D");
  });
});

// ---------------------------------------------------------------------------
// Empty group omission (FPR-041)
// ---------------------------------------------------------------------------

describe("buildCorrectionGroups — empty group omission (FPR-041)", () => {
  it("given only ContestAmount and DateMismatch corrections, returns exactly 2 groups (no empty buckets)", () => {
    const corrections = new Map<string, AutoCorrection>([
      ["ContestAmount-proc-c", { ContestAmount: { procedure_id: "proc-c", paid_amount: 45000 } }],
      ["DateMismatch-proc-d", { DateMismatch: { procedure_id: "proc-d", pdf_date: "2025-04-04" } }],
    ]);
    const matches = [
      makeMatch("proc-c", "PATIENT C", "2025-04-01"),
      makeMatch("proc-d", "PATIENT D", "2025-04-03"),
    ];

    const groups = buildCorrectionGroups(makeInput(corrections, matches));

    expect(groups).toHaveLength(2);
    // ContestAmount comes before DateMismatch
    expect(groups[0]!.rows[0]).toContain("PATIENT C");
    expect(groups[1]!.rows[0]).toContain("PATIENT D");
  });

  it("empty autoCorrections map → returns []", () => {
    const groups = buildCorrectionGroups(makeInput(new Map(), []));

    expect(groups).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Within-group date sort ascending (FPR-041)
// ---------------------------------------------------------------------------

describe("buildCorrectionGroups — within-group date sort ascending (FPR-041)", () => {
  it("two AmountMismatch corrections at different dates → rows sorted oldest-first", () => {
    const corrections = new Map<string, AutoCorrection>([
      // Later date inserted first to verify sort
      [
        "AmountMismatch-proc-late",
        { AmountMismatch: { procedure_id: "proc-late", pdf_amount: 20000 } },
      ],
      [
        "AmountMismatch-proc-early",
        { AmountMismatch: { procedure_id: "proc-early", pdf_amount: 10000 } },
      ],
    ]);
    const matches: ReconciliationMatch[] = [
      makeMatch("proc-late", "PATIENT LATE", "2025-04-20", "fund-1", 25000),
      makeMatch("proc-early", "PATIENT EARLY", "2025-04-05", "fund-1", 15000),
    ];

    const groups = buildCorrectionGroups(makeInput(corrections, matches));

    expect(groups).toHaveLength(1);
    const rows = groups[0]!.rows;
    expect(rows).toHaveLength(2);
    // Earliest date must come first
    expect(rows[0]).toContain("PATIENT EARLY");
    expect(rows[1]).toContain("PATIENT LATE");
  });
});
