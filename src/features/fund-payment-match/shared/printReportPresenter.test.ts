import { describe, expect, it } from "vitest";
import type { AutoCorrection, ReconciliationMatch, UnreconciledProcedure } from "@/bindings";
import type { PrintReportInput } from "./printReportPresenter";
import { buildPrintReportViewModel } from "./printReportPresenter";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUnreconciled(overrides: Partial<UnreconciledProcedure> = {}): UnreconciledProcedure {
  return {
    procedure_id: "proc-1",
    patient_name: "DUPONT Jean",
    ssn: "1234567890123",
    procedure_date: "2025-04-01",
    amount: 50000, // 50.000 thousandths
    ...overrides,
  };
}

const baseInput: PrintReportInput = {
  pdfFileName: "remise-2025-04.pdf",
  periodStart: "2025-04-01",
  periodEnd: "2025-04-30",
  generationDate: "2025-05-03T10:00:00",
  unreconciled: [],
  autoCorrections: new Map(),
  matches: [],
};

// ---------------------------------------------------------------------------
// Header (FPR-020)
// ---------------------------------------------------------------------------

describe("buildPrintReportViewModel — header", () => {
  it("populates header fields from input (FPR-020)", () => {
    const vm = buildPrintReportViewModel(baseInput);

    expect(vm.header.pdfFileName).toBe("remise-2025-04.pdf");
    expect(vm.header.periodStart).toBe("2025-04-01");
    expect(vm.header.periodEnd).toBe("2025-04-30");
    expect(vm.header.generationDate).toBe("2025-05-03T10:00:00");
  });
});

// ---------------------------------------------------------------------------
// Section 1 — unreconciled procedures (FPR-032, FPR-033)
// ---------------------------------------------------------------------------

describe("buildPrintReportViewModel — section 1", () => {
  it("non-empty: unreconciledRows has correct entries and total is sum of thousandths (FPR-033)", () => {
    const input: PrintReportInput = {
      ...baseInput,
      unreconciled: [
        makeUnreconciled({
          procedure_id: "proc-1",
          amount: 50000,
          procedure_date: "2025-04-01",
          patient_name: "DUPONT Jean",
          ssn: "1111111111111",
        }),
        makeUnreconciled({
          procedure_id: "proc-2",
          amount: 30000,
          procedure_date: "2025-04-15",
          patient_name: "MARTIN Alice",
          ssn: "2222222222222",
        }),
      ],
    };

    const vm = buildPrintReportViewModel(input);

    expect(vm.unreconciledRows).toHaveLength(2);
    expect(vm.unreconciledRows[0]).toMatchObject({
      date: "2025-04-01",
      patientName: "DUPONT Jean",
      ssn: "1111111111111",
      amountThousandths: 50000,
    });
    expect(vm.unreconciledRows[1]).toMatchObject({
      date: "2025-04-15",
      patientName: "MARTIN Alice",
      ssn: "2222222222222",
      amountThousandths: 30000,
    });
    expect(vm.unreconciledTotalThousandths).toBe(80000);
  });

  it("empty: unreconciledRows is [] and unreconciledTotalThousandths is null (FPR-032)", () => {
    const vm = buildPrintReportViewModel({ ...baseInput, unreconciled: [] });

    expect(vm.unreconciledRows).toEqual([]);
    expect(vm.unreconciledTotalThousandths).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Section 2 — correction groups (FPR-040, FPR-041, FPR-042)
// ---------------------------------------------------------------------------

describe("buildPrintReportViewModel — section 2", () => {
  it("empty autoCorrections → correctionGroups is [] (FPR-040)", () => {
    const vm = buildPrintReportViewModel(baseInput);

    expect(vm.correctionGroups).toEqual([]);
  });

  it("groups emitted in FPR-041 priority order; empty groups are skipped", () => {
    const corrections = new Map<string, AutoCorrection>([
      // Only DateMismatch and ContestAmount are present (priority 6 and 1 respectively)
      ["DateMismatch-proc-1", { DateMismatch: { procedure_id: "proc-1", pdf_date: "2025-04-02" } }],
      ["ContestAmount-proc-2", { ContestAmount: { procedure_id: "proc-2", paid_amount: 40000 } }],
    ]);
    // Provide SingleMatchIssue matches so ContestAmount can resolve patient data
    const matches: ReconciliationMatch[] = [
      {
        type: "SingleMatchIssue",
        data: {
          pdf_line: {
            line_index: 0,
            payment_date: "2025-05-02",
            invoice_number: "012345678",
            fund_name: "CPAM 931",
            patient_name: "DUPONT Jean",
            ssn: "1111111111111",
            nature: "SF",
            procedure_start_date: "2025-04-01",
            procedure_end_date: "2025-04-01",
            is_period: false,
            amount: 50.0,
          },
          db_match: {
            procedure_id: "proc-1",
            procedure_date: "2025-04-01",
            fund_id: "fund-1",
            amount: 50000,
            anomalies: ["DateMismatch"],
          },
        },
      },
      {
        type: "SingleMatchIssue",
        data: {
          pdf_line: {
            line_index: 1,
            payment_date: "2025-05-02",
            invoice_number: "012345679",
            fund_name: "CPAM 931",
            patient_name: "MARTIN Alice",
            ssn: "2222222222222",
            nature: "SF",
            procedure_start_date: "2025-04-15",
            procedure_end_date: "2025-04-15",
            is_period: false,
            amount: 40.0,
          },
          db_match: {
            procedure_id: "proc-2",
            procedure_date: "2025-04-15",
            fund_id: "fund-1",
            amount: 40000,
            anomalies: [],
          },
        },
      },
    ];

    const vm = buildPrintReportViewModel({ ...baseInput, autoCorrections: corrections, matches });

    // Only two groups: ContestAmount first (priority 1), DateMismatch last (priority 6)
    expect(vm.correctionGroups).toHaveLength(2);
    expect(vm.correctionGroups[0]!.type).toBe("ContestAmount");
    expect(vm.correctionGroups[1]!.type).toBe("DateMismatch");
  });

  it("all six correction types appear in correct priority order when all present", () => {
    const matches: ReconciliationMatch[] = [
      {
        type: "SingleMatchIssue",
        data: {
          pdf_line: {
            line_index: 0,
            payment_date: "2025-05-02",
            invoice_number: "001",
            fund_name: "CPAM 931",
            patient_name: "PATIENT A",
            ssn: "1111111111111",
            nature: "SF",
            procedure_start_date: "2025-04-01",
            procedure_end_date: "2025-04-01",
            is_period: false,
            amount: 50.0,
          },
          db_match: {
            procedure_id: "proc-contest",
            procedure_date: "2025-04-01",
            fund_id: "fund-1",
            amount: 50000,
            anomalies: [],
          },
        },
      },
      {
        type: "SingleMatchIssue",
        data: {
          pdf_line: {
            line_index: 1,
            payment_date: "2025-05-02",
            invoice_number: "002",
            fund_name: "CPAM 931",
            patient_name: "PATIENT B",
            ssn: "2222222222222",
            nature: "SF",
            procedure_start_date: "2025-04-02",
            procedure_end_date: "2025-04-02",
            is_period: false,
            amount: 30.0,
          },
          db_match: {
            procedure_id: "proc-amount",
            procedure_date: "2025-04-02",
            fund_id: "fund-1",
            amount: 40000,
            anomalies: ["AmountMismatch"],
          },
        },
      },
      {
        type: "SingleMatchIssue",
        data: {
          pdf_line: {
            line_index: 2,
            payment_date: "2025-05-02",
            invoice_number: "003",
            fund_name: "CPAM 932",
            patient_name: "PATIENT C",
            ssn: "3333333333333",
            nature: "SF",
            procedure_start_date: "2025-04-03",
            procedure_end_date: "2025-04-03",
            is_period: false,
            amount: 20.0,
          },
          db_match: {
            procedure_id: "proc-fund",
            procedure_date: "2025-04-03",
            fund_id: "fund-2",
            amount: 20000,
            anomalies: ["FundMismatch"],
          },
        },
      },
      {
        type: "SingleMatchIssue",
        data: {
          pdf_line: {
            line_index: 3,
            payment_date: "2025-05-02",
            invoice_number: "004",
            fund_name: "CPAM 931",
            patient_name: "PATIENT D",
            ssn: "4444444444444",
            nature: "SF",
            procedure_start_date: "2025-04-04",
            procedure_end_date: "2025-04-04",
            is_period: false,
            amount: 10.0,
          },
          db_match: {
            procedure_id: "proc-date",
            procedure_date: "2025-04-03",
            fund_id: "fund-1",
            amount: 10000,
            anomalies: ["DateMismatch"],
          },
        },
      },
      {
        type: "SingleMatchIssue",
        data: {
          pdf_line: {
            line_index: 4,
            payment_date: "2025-05-02",
            invoice_number: "005",
            fund_name: "CPAM 931",
            patient_name: "PATIENT E",
            ssn: "5555555555555",
            nature: "SF",
            procedure_start_date: "2025-04-05",
            procedure_end_date: "2025-04-05",
            is_period: false,
            amount: 15.0,
          },
          db_match: {
            procedure_id: "proc-link",
            procedure_date: "2025-04-05",
            fund_id: null,
            amount: null,
            anomalies: [],
          },
        },
      },
    ];

    const corrections = new Map<string, AutoCorrection>([
      [
        "ContestAmount-proc-contest",
        { ContestAmount: { procedure_id: "proc-contest", paid_amount: 45000 } },
      ],
      [
        "CreateProcedure-0",
        {
          CreateProcedure: {
            ssn: "9999999999999",
            patient_name: "NEW PATIENT",
            procedure_date: "2025-04-10",
            payment_date: "2025-05-02",
            billed_amount: 25000,
            pdf_fund_label: "CPAM 931",
          },
        },
      ],
      [
        "LinkProcedure-proc-link",
        {
          LinkProcedure: {
            procedure_id: "proc-link",
            pdf_ssn: "5555555555555",
            pdf_fund_label: "CPAM 931",
            payment_date: "2025-05-02",
          },
        },
      ],
      [
        "AmountMismatch-proc-amount",
        { AmountMismatch: { procedure_id: "proc-amount", pdf_amount: 30000 } },
      ],
      [
        "FundMismatch-proc-fund",
        { FundMismatch: { procedure_id: "proc-fund", pdf_fund_label: "CPAM 932" } },
      ],
      [
        "DateMismatch-proc-date",
        { DateMismatch: { procedure_id: "proc-date", pdf_date: "2025-04-04" } },
      ],
    ]);

    const vm = buildPrintReportViewModel({ ...baseInput, autoCorrections: corrections, matches });

    const types = vm.correctionGroups.map((g) => g.type);
    expect(types).toEqual([
      "ContestAmount",
      "CreateProcedure",
      "LinkProcedure",
      "AmountMismatch",
      "FundMismatch",
      "DateMismatch",
    ]);
  });

  // ── FPR-042: one test per correction type ──────────────────────────────────

  it("ContestAmount row has patient_name, procedure_date, billed_amount (thousandths), paid_amount (FPR-042)", () => {
    const match: ReconciliationMatch = {
      type: "SingleMatchIssue",
      data: {
        pdf_line: {
          line_index: 0,
          payment_date: "2025-05-02",
          invoice_number: "001",
          fund_name: "CPAM 931",
          patient_name: "DUPONT Jean",
          ssn: "1111111111111",
          nature: "SF",
          procedure_start_date: "2025-04-15",
          procedure_end_date: "2025-04-15",
          is_period: false,
          amount: 50.0,
        },
        db_match: {
          procedure_id: "proc-contest",
          procedure_date: "2025-04-15",
          fund_id: "fund-1",
          amount: 50000,
          anomalies: [],
        },
      },
    };

    const corrections = new Map<string, AutoCorrection>([
      [
        "ContestAmount-proc-contest",
        { ContestAmount: { procedure_id: "proc-contest", paid_amount: 45000 } },
      ],
    ]);

    const vm = buildPrintReportViewModel({
      ...baseInput,
      autoCorrections: corrections,
      matches: [match],
    });

    expect(vm.correctionGroups).toHaveLength(1);
    const group = vm.correctionGroups[0]!;
    expect(group.type).toBe("ContestAmount");
    expect(group.rows).toHaveLength(1);
    expect(group.rows[0]).toMatchObject({
      patientName: "DUPONT Jean",
      procedureDate: "2025-04-15",
      billedAmountThousandths: 50000,
      paidAmountThousandths: 45000,
    });
  });

  it("CreateProcedure row has patient_name, ssn, procedure_date, pdf_fund_label, billed_amount (thousandths) (FPR-042)", () => {
    const correction: AutoCorrection = {
      CreateProcedure: {
        ssn: "9999999999999",
        patient_name: "NEW PATIENT",
        procedure_date: "2025-04-10",
        payment_date: "2025-05-02",
        billed_amount: 25000,
        pdf_fund_label: "CPAM 931",
      },
    };

    const corrections = new Map<string, AutoCorrection>([["CreateProcedure-0", correction]]);

    const vm = buildPrintReportViewModel({
      ...baseInput,
      autoCorrections: corrections,
      matches: [],
    });

    expect(vm.correctionGroups).toHaveLength(1);
    const group = vm.correctionGroups[0]!;
    expect(group.type).toBe("CreateProcedure");
    expect(group.rows).toHaveLength(1);
    expect(group.rows[0]).toMatchObject({
      patientName: "NEW PATIENT",
      ssn: "9999999999999",
      procedureDate: "2025-04-10",
      fundLabel: "CPAM 931",
      billedAmountThousandths: 25000,
    });
  });

  it("LinkProcedure row has patient_name, ssn, pdf_fund_label, payment_date resolved from matches (FPR-042)", () => {
    const matchForLink: ReconciliationMatch = {
      type: "SingleMatchIssue",
      data: {
        pdf_line: {
          line_index: 0,
          payment_date: "2025-05-02",
          invoice_number: "005",
          fund_name: "CPAM 931",
          patient_name: "PATIENT LINK",
          ssn: "5555555555555",
          nature: "SF",
          procedure_start_date: "2025-04-05",
          procedure_end_date: "2025-04-05",
          is_period: false,
          amount: 15.0,
        },
        db_match: {
          procedure_id: "proc-link",
          procedure_date: "2025-04-05",
          fund_id: null,
          amount: null,
          anomalies: [],
        },
      },
    };

    const corrections = new Map<string, AutoCorrection>([
      [
        "LinkProcedure-proc-link",
        {
          LinkProcedure: {
            procedure_id: "proc-link",
            pdf_ssn: "5555555555555",
            pdf_fund_label: "CPAM 931",
            payment_date: "2025-05-02",
          },
        },
      ],
    ]);

    const vm = buildPrintReportViewModel({
      ...baseInput,
      autoCorrections: corrections,
      matches: [matchForLink],
    });

    expect(vm.correctionGroups).toHaveLength(1);
    const group = vm.correctionGroups[0]!;
    expect(group.type).toBe("LinkProcedure");
    expect(group.rows).toHaveLength(1);
    expect(group.rows[0]).toMatchObject({
      patientName: "PATIENT LINK",
      ssn: "5555555555555",
      fundLabel: "CPAM 931",
      paymentDate: "2025-05-02",
    });
  });

  it("AmountMismatch row has patient_name, procedure_date, original amount (db_match), pdf_amount (corrected) (FPR-042)", () => {
    const match: ReconciliationMatch = {
      type: "SingleMatchIssue",
      data: {
        pdf_line: {
          line_index: 0,
          payment_date: "2025-05-02",
          invoice_number: "002",
          fund_name: "CPAM 931",
          patient_name: "PATIENT B",
          ssn: "2222222222222",
          nature: "SF",
          procedure_start_date: "2025-04-02",
          procedure_end_date: "2025-04-02",
          is_period: false,
          amount: 30.0,
        },
        db_match: {
          procedure_id: "proc-amount",
          procedure_date: "2025-04-02",
          fund_id: "fund-1",
          amount: 40000,
          anomalies: ["AmountMismatch"],
        },
      },
    };

    const corrections = new Map<string, AutoCorrection>([
      [
        "AmountMismatch-proc-amount",
        { AmountMismatch: { procedure_id: "proc-amount", pdf_amount: 30000 } },
      ],
    ]);

    const vm = buildPrintReportViewModel({
      ...baseInput,
      autoCorrections: corrections,
      matches: [match],
    });

    expect(vm.correctionGroups).toHaveLength(1);
    const group = vm.correctionGroups[0]!;
    expect(group.type).toBe("AmountMismatch");
    expect(group.rows[0]).toMatchObject({
      patientName: "PATIENT B",
      procedureDate: "2025-04-02",
      originalAmountThousandths: 40000,
      correctedAmountThousandths: 30000,
    });
  });

  it("FundMismatch row has patient_name, procedure_date, original fund_id, pdf_fund_label (corrected) (FPR-042)", () => {
    const match: ReconciliationMatch = {
      type: "SingleMatchIssue",
      data: {
        pdf_line: {
          line_index: 0,
          payment_date: "2025-05-02",
          invoice_number: "003",
          fund_name: "CPAM 932",
          patient_name: "PATIENT C",
          ssn: "3333333333333",
          nature: "SF",
          procedure_start_date: "2025-04-03",
          procedure_end_date: "2025-04-03",
          is_period: false,
          amount: 20.0,
        },
        db_match: {
          procedure_id: "proc-fund",
          procedure_date: "2025-04-03",
          fund_id: "fund-2",
          amount: 20000,
          anomalies: ["FundMismatch"],
        },
      },
    };

    const corrections = new Map<string, AutoCorrection>([
      [
        "FundMismatch-proc-fund",
        { FundMismatch: { procedure_id: "proc-fund", pdf_fund_label: "CPAM 932" } },
      ],
    ]);

    const vm = buildPrintReportViewModel({
      ...baseInput,
      autoCorrections: corrections,
      matches: [match],
    });

    expect(vm.correctionGroups).toHaveLength(1);
    const group = vm.correctionGroups[0]!;
    expect(group.type).toBe("FundMismatch");
    expect(group.rows[0]).toMatchObject({
      patientName: "PATIENT C",
      procedureDate: "2025-04-03",
      originalFundId: "fund-2",
      correctedFundLabel: "CPAM 932",
    });
  });

  it("DateMismatch row has patient_name, original procedure_date, pdf_date (corrected) (FPR-042)", () => {
    const match: ReconciliationMatch = {
      type: "SingleMatchIssue",
      data: {
        pdf_line: {
          line_index: 0,
          payment_date: "2025-05-02",
          invoice_number: "004",
          fund_name: "CPAM 931",
          patient_name: "PATIENT D",
          ssn: "4444444444444",
          nature: "SF",
          procedure_start_date: "2025-04-04",
          procedure_end_date: "2025-04-04",
          is_period: false,
          amount: 10.0,
        },
        db_match: {
          procedure_id: "proc-date",
          procedure_date: "2025-04-03",
          fund_id: "fund-1",
          amount: 10000,
          anomalies: ["DateMismatch"],
        },
      },
    };

    const corrections = new Map<string, AutoCorrection>([
      [
        "DateMismatch-proc-date",
        { DateMismatch: { procedure_id: "proc-date", pdf_date: "2025-04-04" } },
      ],
    ]);

    const vm = buildPrintReportViewModel({
      ...baseInput,
      autoCorrections: corrections,
      matches: [match],
    });

    expect(vm.correctionGroups).toHaveLength(1);
    const group = vm.correctionGroups[0]!;
    expect(group.type).toBe("DateMismatch");
    expect(group.rows[0]).toMatchObject({
      patientName: "PATIENT D",
      originalDate: "2025-04-03",
      correctedDate: "2025-04-04",
    });
  });

  // ── Sorting within a group (FPR-041) ──────────────────────────────────────

  it("rows within a correction group are sorted by date ascending (FPR-041)", () => {
    const corrections = new Map<string, AutoCorrection>([
      ["DateMismatch-proc-b", { DateMismatch: { procedure_id: "proc-b", pdf_date: "2025-04-20" } }],
      ["DateMismatch-proc-a", { DateMismatch: { procedure_id: "proc-a", pdf_date: "2025-04-05" } }],
    ]);

    const matches: ReconciliationMatch[] = [
      {
        type: "SingleMatchIssue",
        data: {
          pdf_line: {
            line_index: 1,
            payment_date: "2025-05-02",
            invoice_number: "002",
            fund_name: "CPAM 931",
            patient_name: "PATIENT LATE",
            ssn: "2222222222222",
            nature: "SF",
            procedure_start_date: "2025-04-20",
            procedure_end_date: "2025-04-20",
            is_period: false,
            amount: 10.0,
          },
          db_match: {
            procedure_id: "proc-b",
            procedure_date: "2025-04-19",
            fund_id: "fund-1",
            amount: 10000,
            anomalies: ["DateMismatch"],
          },
        },
      },
      {
        type: "SingleMatchIssue",
        data: {
          pdf_line: {
            line_index: 0,
            payment_date: "2025-05-02",
            invoice_number: "001",
            fund_name: "CPAM 931",
            patient_name: "PATIENT EARLY",
            ssn: "1111111111111",
            nature: "SF",
            procedure_start_date: "2025-04-05",
            procedure_end_date: "2025-04-05",
            is_period: false,
            amount: 10.0,
          },
          db_match: {
            procedure_id: "proc-a",
            procedure_date: "2025-04-04",
            fund_id: "fund-1",
            amount: 10000,
            anomalies: ["DateMismatch"],
          },
        },
      },
    ];

    const vm = buildPrintReportViewModel({ ...baseInput, autoCorrections: corrections, matches });

    expect(vm.correctionGroups).toHaveLength(1);
    const group = vm.correctionGroups[0]!;
    expect(group.rows).toHaveLength(2);
    // Earlier date must come first
    expect(group.rows[0]).toMatchObject({ originalDate: "2025-04-04" });
    expect(group.rows[1]).toMatchObject({ originalDate: "2025-04-19" });
  });

  // ── Lookup: LinkProcedure resolves patient/date/fund from matches (FPR-041) ─

  it("LinkProcedure with matching SingleMatchIssue resolves patient_name and procedure_date from match pdf_line", () => {
    const matchForLink: ReconciliationMatch = {
      type: "SingleMatchIssue",
      data: {
        pdf_line: {
          line_index: 5,
          payment_date: "2025-05-10",
          invoice_number: "010",
          fund_name: "MGEN 001",
          patient_name: "BERNARD Sophie",
          ssn: "6666666666666",
          nature: "SF",
          procedure_start_date: "2025-04-20",
          procedure_end_date: "2025-04-20",
          is_period: false,
          amount: 12.0,
        },
        db_match: {
          procedure_id: "proc-linked",
          procedure_date: "2025-04-20",
          fund_id: null,
          amount: null,
          anomalies: [],
        },
      },
    };

    const corrections = new Map<string, AutoCorrection>([
      [
        "LinkProcedure-proc-linked",
        {
          LinkProcedure: {
            procedure_id: "proc-linked",
            pdf_ssn: "6666666666666",
            pdf_fund_label: "MGEN 001",
            payment_date: "2025-05-10",
          },
        },
      ],
    ]);

    const vm = buildPrintReportViewModel({
      ...baseInput,
      autoCorrections: corrections,
      matches: [matchForLink],
    });

    const group = vm.correctionGroups[0]!;
    expect(group.type).toBe("LinkProcedure");
    expect(group.rows[0]).toMatchObject({
      patientName: "BERNARD Sophie",
      ssn: "6666666666666",
      fundLabel: "MGEN 001",
      paymentDate: "2025-05-10",
    });
  });
});
