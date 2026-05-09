/**
 * Shared fixtures for the post-reconciliation report (FPR).
 *
 * Used by:
 *   - `useReportGeneration.test.ts` and `reportPresenter.test.ts`
 *     to drive hook + presenter assertions with realistic data.
 *   - The visual-proof preview to render representative content.
 *
 * Keeping a single source of truth means the test inputs stay aligned with
 * what reviewers see in the screenshots.
 */

import type {
  AutoCorrection,
  ReconcileAndCandidatesResponse,
  ReconciliationMatch,
  ReportGenerationRequest,
  UnreconciledProcedure,
} from "@/bindings";

// ── Patient + procedure mock domain ────────────────────────────────────────

export const mockUnreconciledProcedures: UnreconciledProcedure[] = [
  {
    procedure_id: "proc-1",
    patient_name: "DUPONT Jean",
    ssn: "1234567890123",
    procedure_date: "2026-04-05",
    amount: 85_000, // 85,00 €
  },
  {
    procedure_id: "proc-2",
    patient_name: "MARTIN Claire",
    ssn: "2345678901234",
    procedure_date: "2026-04-12",
    amount: 60_000, // 60,00 €
  },
  {
    procedure_id: "proc-3",
    patient_name: "BERNARD Olivier",
    ssn: "3456789012345",
    procedure_date: "2026-04-20",
    amount: 110_000, // 110,00 €
  },
];

export const mockFundIdToLabel: Map<string, string> = new Map([
  ["fund-cpam-75", "CPAM 75"],
  ["fund-cpam-93", "CPAM 93"],
  ["fund-mgen", "MGEN"],
]);

// ── Reconciliation matches that anchor the corrections ─────────────────────

function singleMatchIssue(
  procedureId: string,
  patientName: string,
  procedureDate: string,
  fundId: string | null,
  amountThousandths: number,
): ReconciliationMatch {
  return {
    type: "SingleMatchIssue",
    data: {
      pdf_line: {
        line_index: 0,
        payment_date: "2026-05-02",
        invoice_number: "INV-001",
        fund_name: "CPAM 75",
        patient_name: patientName,
        ssn: "0000000000000",
        nature: "SF",
        procedure_start_date: procedureDate,
        procedure_end_date: procedureDate,
        is_period: false,
        amount: amountThousandths / 1000,
      },
      db_match: {
        procedure_id: procedureId,
        procedure_date: procedureDate,
        fund_id: fundId,
        amount: amountThousandths,
        anomalies: [],
      },
    },
  };
}

export const mockReconciliationMatches: ReconciliationMatch[] = [
  singleMatchIssue("proc-amount", "RICHARD Sophie", "2026-04-08", "fund-cpam-75", 85_000),
  singleMatchIssue("proc-fund", "PETIT Lucas", "2026-04-10", "fund-cpam-75", 70_000),
  singleMatchIssue("proc-date", "ROBERT Marie", "2026-04-15", "fund-cpam-93", 95_000),
  singleMatchIssue("proc-contest", "MOREAU Paul", "2026-04-18", "fund-mgen", 120_000),
  singleMatchIssue("proc-link", "DURAND Anne", "2026-04-22", null, 0),
];

export const mockReconciliationData: ReconcileAndCandidatesResponse = {
  candidates: [],
  reconciliation: { matches: mockReconciliationMatches },
};

// ── Corrections covering the six FPR-042 variants ──────────────────────────

export const mockAutoCorrections: Map<string, AutoCorrection> = new Map([
  [
    "AmountMismatch-proc-amount",
    { AmountMismatch: { procedure_id: "proc-amount", pdf_amount: 80_000 } },
  ],
  [
    "FundMismatch-proc-fund",
    { FundMismatch: { procedure_id: "proc-fund", pdf_fund_label: "CPAM 93" } },
  ],
  [
    "DateMismatch-proc-date",
    { DateMismatch: { procedure_id: "proc-date", pdf_date: "2026-04-16" } },
  ],
  [
    "ContestAmount-proc-contest",
    { ContestAmount: { procedure_id: "proc-contest", paid_amount: 100_000 } },
  ],
  [
    "LinkProcedure-proc-link",
    {
      LinkProcedure: {
        procedure_id: "proc-link",
        pdf_ssn: "9999999999999",
        pdf_fund_label: "CPAM 75",
        payment_date: "2026-04-25",
      },
    },
  ],
  [
    "CreateProcedure-0",
    {
      CreateProcedure: {
        ssn: "8888888888888",
        patient_name: "LEROY Camille",
        procedure_date: "2026-04-28",
        payment_date: "2026-05-02",
        billed_amount: 45_000,
        pdf_fund_label: "MGEN",
      },
    },
  ],
]);

// ── Period + filename used by the report header / default save filename ────

export const mockReportPeriod = { start: "2026-04-01", end: "2026-04-30" } as const;
export const mockSourceFileName = "remise-2026-04.pdf";

// ── Sample PDF bytes ───────────────────────────────────────────────────────

/**
 * Stub byte stream for tests that only need a `Uint8Array` to convert to a
 * `Blob` URL — the content is a well-formed but minimal `%PDF-1.4` header.
 * Browsers will render an empty page; the visible report content in the
 * visual-proof preview is provided by a separate HTML mockup driven by the
 * mock domain data above.
 */
export const samplePdfBytes: Uint8Array = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a, 0x31,
  0x20, 0x30, 0x20, 0x6f, 0x62, 0x6a, 0x0a, 0x3c, 0x3c, 0x2f, 0x54, 0x79, 0x70, 0x65, 0x2f, 0x43,
  0x61, 0x74, 0x61, 0x6c, 0x6f, 0x67, 0x2f, 0x50, 0x61, 0x67, 0x65, 0x73, 0x20, 0x32, 0x20, 0x30,
  0x20, 0x52, 0x3e, 0x3e, 0x0a, 0x65, 0x6e, 0x64, 0x6f, 0x62, 0x6a, 0x0a, 0x32, 0x20, 0x30, 0x20,
  0x6f, 0x62, 0x6a, 0x0a, 0x3c, 0x3c, 0x2f, 0x54, 0x79, 0x70, 0x65, 0x2f, 0x50, 0x61, 0x67, 0x65,
  0x73, 0x2f, 0x43, 0x6f, 0x75, 0x6e, 0x74, 0x20, 0x30, 0x3e, 0x3e, 0x0a, 0x65, 0x6e, 0x64, 0x6f,
  0x62, 0x6a, 0x0a, 0x78, 0x72, 0x65, 0x66, 0x0a, 0x30, 0x20, 0x33, 0x0a, 0x74, 0x72, 0x61, 0x69,
  0x6c, 0x65, 0x72, 0x0a, 0x3c, 0x3c, 0x2f, 0x53, 0x69, 0x7a, 0x65, 0x20, 0x33, 0x2f, 0x52, 0x6f,
  0x6f, 0x74, 0x20, 0x31, 0x20, 0x30, 0x20, 0x52, 0x3e, 0x3e, 0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46,
  0x0a,
]);

/**
 * Minimal valid `ReportGenerationRequest` for tests that need a structurally
 * complete request without exercising every optional field. Mirrors the
 * shape produced by `useReportGeneration` but with placeholder strings.
 */
export const sampleReportRequest: ReportGenerationRequest = {
  title: "Reconciliation Report",
  continuation_title: "Reconciliation Report (continued)",
  header_lines: ["Period: 2025-04-01 – 2025-04-30"],
  unreconciled: {
    type: "Empty",
    data: { heading: "Unreconciled procedures", empty_message: "All reconciled." },
  },
  correction_section_heading: "Corrections applied",
  correction_groups: [],
  page_label: "Page",
};
