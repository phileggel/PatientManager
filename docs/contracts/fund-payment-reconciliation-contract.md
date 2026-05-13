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

Runs the 8-pass matching algorithm and groups results into `FundPaymentGroupCandidate`s for user review. Combines reconciliation and candidate creation in a single call. Negative-amount lines are classified as `NotFoundIssue` (R29). Sets the response flag `already_imported = true` when every candidate corresponds to an existing fund-payment group (same `fund_label` + `payment_date` + `total_amount`), so the frontend can short-circuit a re-import before showing the anomaly UI or dispatching any downstream command (R3, defensive).

- **Args:** `parse_result: PdfParseResult`
- **Returns:** `ReconcileAndCandidatesResponse` — includes `already_imported: bool`
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

Renders the post-reconciliation report as a PDF document. The request payload carries every pre-resolved string the renderer will place — translated labels, formatted dates, formatted currency values, and per-correction joined row strings. The backend performs no translation, no formatting, and no database lookup (FPR-013, FPR-021). Same architectural role as `export_reconciliation_csv`: a rendering mode of the reconciliation session output.

- **Args:** `request: ReportGenerationRequest`
- **Returns:** `Vec<u8>` — PDF byte stream
- **Errors:**
  - `InvalidRequest` — payload is structurally invalid: a required string is empty, exceeds the length cap, contains control characters, or a collection (header lines, unreconciled rows, correction groups, correction rows) exceeds its DoS-guard cap
  - `PdfGenerationFailed` — rendering failed downstream of validation (e.g. font load, internal renderer error)

---

### `export_and_open_fund_reconciliation_report_pdf` — FPR-015, FPR-016

Renders the report, writes it to the platform Downloads directory under the caller-supplied leaf filename, then launches the system default PDF viewer on the saved file. Returns the absolute path the file was written to so the frontend can surface its final name in the confirmation toast.

`filename` is treated as a leaf name only — no path separators, no `..` segments, must end in `.pdf`, length-capped (200 chars). The destination directory is fixed to the platform Downloads folder; no user-supplied path component reaches the filesystem. If a same-named file already exists, a ` (N)` suffix is appended before the extension (`name.pdf` → `name (1).pdf` → …) so a re-export never silently overwrites a prior file.

- **Args:** `request: ReportGenerationRequest, filename: String`
- **Returns:** `String` — absolute path of the saved file
- **Errors:**
  - `InvalidRequest` — payload validation, or filename rejected by the leaf-name validator
  - `PdfGenerationFailed` — rendering failed downstream of validation
  - `WriteFailed` — filesystem write failed (permission, disk full, missing Downloads dir, …)
  - `OpenFailed` — saved file could not be handed to the system PDF launcher (no associated app, launcher refused)

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
    fund_id: Option<String>,
    amount: Option<i64>,
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
    already_imported: bool,        // R3 — every candidate maps to an existing group
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

// FPR-011, FPR-013, FPR-021 — payload assembled by the frontend when the
// user clicks Report. Every string is pre-resolved (translated, formatted)
// before sending; the backend has no language tables and no formatters —
// it is a pure data → PDF assembler.
struct ReportGenerationRequest {
    title: String,                            // FPR-020 — pre-translated bold title
    continuation_title: String,               // FPR-022 — breadcrumb on pages 2+
    header_lines: Vec<String>,                // FPR-020 — pre-formatted info lines
    unreconciled: UnreconciledSection,        // FPR-030 to FPR-033
    correction_section_heading: String,       // FPR-040 — only used if groups non-empty
    correction_groups: Vec<CorrectionGroup>,  // FPR-040 to FPR-042 — empty list omits the section
    page_label: String,                       // FPR-022 — e.g. "Page"
}

// FPR-030 to FPR-033 — Section 1 content branches. The frontend chooses
// the variant based on whether any unreconciled procedures exist.
enum UnreconciledSection {
    // FPR-032 — empty-state confirmation; no table, no total
    Empty {
        heading: String,
        empty_message: String,
    },
    // FPR-031, FPR-033 — populated table with header row, data rows, total
    Rows {
        heading: String,
        column_headers: UnreconciledColumns,
        rows: Vec<UnreconciledRow>,
        total_label: String,                  // FPR-033 — translated "Total"
        total_value: String,                  // FPR-033 — pre-formatted currency
    },
}

// FPR-031 — column-header strings for the four-column unreconciled table.
// Frontend supplies translations; backend places them at fixed anchors.
struct UnreconciledColumns {
    date: String,
    patient: String,
    ssn: String,
    amount: String,
}

// FPR-031 — one data row of the unreconciled table. All four cells are
// pre-formatted by the frontend (date string, patient name, SSN, currency).
struct UnreconciledRow {
    date: String,
    patient: String,
    ssn: String,
    amount: String,
}

// FPR-041, FPR-042 — one correction group within Section 2.
// Frontend joins each correction's variant-specific columns into a single
// pre-formatted row string before sending; backend renders rows as opaque
// text lines beneath the group title.
struct CorrectionGroup {
    title: String,        // pre-translated, e.g. "Corrections de montant"
    rows: Vec<String>,    // each row is a pre-joined line
}

// FPM R1, R6 — data for the two-section edit picker
struct FundPaymentGroupEditData {
    current_procedures: Vec<Procedure>,    // Reconciliated / PartiallyReconciled — removable
    available_procedures: Vec<Procedure>,  // Created, same fund — addable
}

struct FundPaymentCandidateValidation {
    candidate: FundPaymentGroupCandidate,
    status: FundPaymentValidationStatus,
    error: Option<String>,
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
- 2026-05-07 — PR 2 implementation: `unreconciled_procedures` field type changed from `Vec<UnreconciledProcedure>` to `Vec<UnreconciledProcedureRow>` to remove the cross-use-case dependency flagged by reviewer-arch (B18). Field shape is preserved 1:1 for serde compatibility.
- 2026-05-07 — PR 2 i18n pivot: `ReportGenerationRequest` reshaped to carry pre-resolved strings only. Removed `locale`, `source_pdf_filename`, `period_start`, `period_end`, `generation_date`, `unreconciled_procedures`, `enriched_corrections`, `UnreconciledProcedureRow`, `EnrichedAutoCorrection`. Added `title`, `continuation_title`, `header_lines`, `unreconciled` (`UnreconciledSection` enum with `Empty` / `Rows` variants), `UnreconciledColumns`, `UnreconciledRow`, `correction_section_heading`, `correction_groups` (`CorrectionGroup` with pre-joined row strings), `page_label`. Backend is now a pure assembler with no translation or formatting logic; frontend resolves everything via i18next + `Intl.*` before invoking. Supersedes ADR-006.
- 2026-05-13 — Removed `save_fund_reconciliation_report_pdf`. Added `export_and_open_fund_reconciliation_report_pdf`: single command that renders, writes to the platform Downloads directory under a frontend-built locale-aware filename, and launches the system PDF viewer. Filename is validated as a leaf name; collisions use ` (N)` suffixing. Returns the absolute saved path. New error variant: `OpenFailed`.
