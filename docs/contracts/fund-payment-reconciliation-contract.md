# Contract — Fund Payment Reconciliation

> Domain: fund-payment-reconciliation
> Backend module: use_cases/fund_payment_reconciliation
> Last updated by: fund-payment-report spec

## Commands

### `extract_pdf_text` — R2

Extracts raw text from a PDF at the given file path. Used when the file is passed as a path (desktop flow). The extracted text is passed unchanged to `parse_pdf_text`.

- **Args:** `file_path: String`
- **Returns:** `String`
- **Errors:** `PdfExtractionFailed`

---

### `extract_pdf_text_from_bytes` — R2, R28

Extracts raw text from a PDF supplied as raw bytes. Used when the file is opened via the browser file picker. The extracted text is passed unchanged to `parse_pdf_text`.

- **Args:** `bytes: Vec<u8>`
- **Returns:** `String`
- **Errors:** `PdfExtractionFailed`

---

### `parse_pdf_text` — R2, R3, R28

Parses raw PDF text into structured procedure groups. Groups are keyed on (fund, payment date). Validates that the sum of line amounts matches the stated total per group (`is_total_valid`, R2). Lines that cannot be parsed are counted and sampled (R28).

- **Args:** `text: String`
- **Returns:** `PdfParseResult`
- **Errors:** `ParseFailed`

---

### `reconcile_pdf_procedures` — R1, R4, R5, R6, R7, R8, R9, R10, R29

Runs the 8-pass matching algorithm (R4) and classifies each PDF line into a `ReconciliationMatch` variant (R6–R10). Returns the raw match results without creating any DB records. Used when the frontend needs the anomaly list before grouping into candidates.

- **Args:** `parse_result: PdfParseResult`
- **Returns:** `ReconciliationResult`
- **Errors:** —

---

### `reconcile_and_create_candidates` — R1, R3, R4, R5, R6, R7, R8, R9, R10, R29

Runs the 8-pass matching algorithm and groups results into `FundPaymentGroupCandidate`s for user review. Combines reconciliation and candidate creation in a single call. Negative-amount lines are classified as `NotFoundIssue` (R29).

- **Args:** `parse_result: PdfParseResult`
- **Returns:** `ReconcileAndCandidatesResponse`
- **Errors:** —

---

### `export_reconciliation_csv`

Exports the reconciliation result as a CSV string. Used to download a report of the matched/unmatched lines.

- **Args:** `result: ReconciliationResult`
- **Returns:** `String`
- **Errors:** `CsvExportFailed`

---

### `create_fund_payment_from_candidates` — R3, R18, R19

Creates fund-payment groups from validated candidates with no auto-corrections. Performs the duplicate check (R3) and rejects the batch if the PDF was already imported. Updates procedure statuses to `Reconciliated` / `PartiallyReconciled` with `confirmed_payment_date` and `actual_payment_amount` (R18).

- **Args:** `candidates: Vec<FundPaymentGroupCandidate>`
- **Returns:** `Vec<FundPaymentGroup>`
- **Errors:** `DuplicatePdf`, `ProcedureNotFound`, `FundNotFound`

---

### `create_fund_payment_with_auto_corrections` — R3, R11, R12, R13, R14, R15, R16, R17, R18, R19, R29

Creates fund-payment groups and applies user-validated auto-corrections atomically. Correction variants: `AmountMismatch` (R11), `ContestAmount` (R12), `FundMismatch` (R13), `DateMismatch` (R14), `LinkProcedure` (R15), `CreateProcedure` (R16). Unknown funds are resolved and created automatically (R17). Negative-amount procedures via `CreateProcedure` receive `Reconciliated` status directly (R29). Performs the duplicate check (R3).

- **Args:** `candidates: Vec<FundPaymentGroupCandidate>, auto_corrections: Vec<AutoCorrection>`
- **Returns:** `Vec<FundPaymentGroup>`
- **Errors:** `DuplicatePdf`, `ProcedureNotFound`, `ProcedureAlreadyLinked`, `FundResolutionFailed`

---

### `get_unreconciled_procedures_in_range` — R27

Returns procedures with no fund payment in the given date range. Used to display the post-validation unreconciled-procedures report.

- **Args:** `start_date: String, end_date: String`
- **Returns:** `Vec<UnreconciledProcedure>`
- **Errors:** `InvalidDateFormat`

---

### `get_fund_payment_group_edit_data` — FPM R1, R6, R9

Returns both the procedures currently in the group (`Reconciliated` / `PartiallyReconciled`, removable) and the available procedures for the fund (`Created`, addable). Used to populate the two-section picker in the edit modal. Returns a locked-group error if the group has a `BankPayed` status (FPM R9).

- **Args:** `group_id: String, fund_id: String`
- **Returns:** `FundPaymentGroupEditData`
- **Errors:** `GroupNotFound`, `GroupLocked`

---

### `generate_fund_reconciliation_report_pdf` — FPR-011, FPR-013, FPR-020, FPR-021, FPR-022, FPR-030 to FPR-042

Renders the post-reconciliation report as a PDF document. The request payload carries everything needed for rendering — the unreconciled-procedures list and the pre-enriched corrections applied during the session — so the backend performs no database lookup during generation (FPR-013). The active application locale is captured at request time and embedded once in the resulting document (FPR-021). Same architectural role as `export_reconciliation_csv`: a rendering mode of the reconciliation session output.

- **Args:** `request: ReportGenerationRequest`
- **Returns:** `Vec<u8>` — PDF byte stream
- **Errors:**
  - `InvalidRequest` — payload is structurally invalid (empty `locale`, malformed ISO date in `period_start` / `period_end` / `generation_date`, or empty required fields)
  - `PdfGenerationFailed` — rendering failed downstream of validation (e.g. font load, internal renderer error)

---

## Shared Types

```rust
// R2, R28 — structured parse result from a PDF statement
struct PdfParseResult {
    groups: Vec<PdfProcedureGroup>,
    unparsed_line_count: u32,
    unparsed_lines: Vec<String>,   // R28 — sample of up to 5
}

struct PdfProcedureGroup {
    fund_label: String,
    fund_full_name: String,
    payment_date: String,      // ISO date YYYY-MM-DD
    total_amount: i64,
    is_total_valid: bool,      // R2
    lines: Vec<NormalizedPdfLine>,
}

struct NormalizedPdfLine {
    line_index: u32,           // R20 — used for display ordering
    payment_date: String,
    // SSN, patient name, amount, start/end dates — required by matching algorithm
}

enum ReconciliationMatch {
    PerfectSingleMatch { pdf_line: NormalizedPdfLine, db_match: DbMatch },
    PerfectGroupMatch  { pdf_line: NormalizedPdfLine, db_matches: Vec<DbMatch> },
    SingleMatchIssue   { pdf_line: NormalizedPdfLine, db_match: DbMatch },
    GroupMatchIssue    { pdf_line: NormalizedPdfLine, db_matches: Vec<DbMatch> },
    TooManyMatchIssue  { pdf_line: NormalizedPdfLine, candidate_ids: Vec<String> },
    NotFoundIssue      { pdf_line: NormalizedPdfLine, nearby_candidates: Vec<NotFoundCandidate> },
}

enum AnomalyType {
    FundMismatch,
    AmountMismatch,
    DateMismatch,
}

struct DbMatch {
    procedure_id: String,
    procedure_date: String,
    fund_id: String,        // optional
    amount: i64,            // optional
    anomalies: Vec<AnomalyType>,
}

struct NotFoundCandidate {
    procedure_id: String,
    patient_name: String,
    ssn: String,
    procedure_date: String,
    amount: i64,
}

enum AutoCorrection {
    AmountMismatch  { procedure_id: String, pdf_amount: i64 },
    FundMismatch    { procedure_id: String, pdf_fund_label: String },
    DateMismatch    { procedure_id: String, pdf_date: String },
    CreateProcedure { ssn: String, patient_name: String, procedure_date: String,
                      payment_date: String, billed_amount: i64, pdf_fund_label: String },
    LinkProcedure   { procedure_id: String, pdf_ssn: String,
                      pdf_fund_label: String, payment_date: String },
    ContestAmount   { procedure_id: String, paid_amount: i64 },
}

struct FundPaymentGroupCandidate {
    fund_label: String,
    payment_date: String,
    total_amount: i64,
    procedure_ids: Vec<String>,
    matched_amount: i64,
    is_fully_covered: bool,
}

struct ReconcileAndCandidatesResponse {
    candidates: Vec<FundPaymentGroupCandidate>,
    reconciliation: ReconciliationResult,
}

struct ReconciliationResult {
    matches: Vec<ReconciliationMatch>,
}

struct UnreconciledProcedure {
    procedure_id: String,
    patient_name: String,
    ssn: String,
    procedure_date: String,
    amount: i64,
}

// FPR-011, FPR-021 — payload assembled by the frontend when the user clicks
// Report and sent to the backend for PDF rendering. No additional fetch is
// performed; every value the renderer needs is in this payload.
struct ReportGenerationRequest {
    locale: String,                                          // FPR-021 — "fr", "en"
    source_pdf_filename: String,                             // FPR-020 — name only
    period_start: String,                                    // ISO date YYYY-MM-DD
    period_end: String,                                      // ISO date YYYY-MM-DD
    generation_date: String,                                 // ISO 8601 datetime, e.g. 2026-05-06T16:42:00
    unreconciled_procedures: Vec<UnreconciledProcedure>,     // FPR-030, FPR-031
    enriched_corrections: Vec<EnrichedAutoCorrection>,       // FPR-040 to FPR-042
}

// FPR-013, FPR-042 — corrections pre-shaped column-for-column to the
// FPR-042 display table. Each variant carries exactly the fields its row
// renders, so the backend performs no per-row lookup. Frontend builds these
// from the raw `AutoCorrection` plus session DbMatch data before sending.
//
// Currency amounts are in thousandths of a euro (i64 cents-of-cents);
// rendering applies the locale-aware formatter (FPR-021).
enum EnrichedAutoCorrection {
    AmountMismatch {
        patient_name: String,
        procedure_date: String,        // ISO date YYYY-MM-DD
        original_amount: i64,
        corrected_amount: i64,
    },
    FundMismatch {
        patient_name: String,
        procedure_date: String,
        original_fund: String,         // display label, not id
        corrected_fund: String,
    },
    DateMismatch {
        patient_name: String,
        original_date: String,
        corrected_date: String,
    },
    CreateProcedure {
        patient_name: String,
        ssn: String,
        procedure_date: String,
        fund: String,                  // display label
        billed_amount: i64,
    },
    LinkProcedure {
        patient_name: String,
        ssn: String,
        fund: String,                  // display label
        payment_date: String,
    },
    ContestAmount {
        patient_name: String,
        procedure_date: String,
        billed_amount: i64,
        paid_amount: i64,
    },
}

// FPM R1, R6 — data for the two-section edit picker
struct FundPaymentGroupEditData {
    current_procedures: Vec<Procedure>,    // Reconciliated / PartiallyReconciled — removable
    available_procedures: Vec<Procedure>,  // Created, same fund — addable
}

struct FundPaymentCandidateValidation {
    candidate: FundPaymentGroupCandidate,
    status: FundPaymentValidationStatus,
    error: String,   // optional
}

enum FundPaymentValidationStatus {
    Valid,
    Invalid,
}
```

## Events

| Event              | Trigger                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ProcedureUpdated` | After `create_fund_payment_from_candidates` / `create_fund_payment_with_auto_corrections` — procedures move to `Reconciliated` / `PartiallyReconciled` |

## Changelog

- 2026-05-02 — Added by `fund-payment-auto-match` spec + retroactive from specta_builder.rs: extract_pdf_text, extract_pdf_text_from_bytes, parse_pdf_text, reconcile_pdf_procedures, reconcile_and_create_candidates, export_reconciliation_csv, create_fund_payment_from_candidates, create_fund_payment_with_auto_corrections, get_unreconciled_procedures_in_range, get_fund_payment_group_edit_data
- 2026-05-06 — Added by `fund-payment-report` spec: generate_fund_reconciliation_report_pdf, EnrichedAutoCorrection
