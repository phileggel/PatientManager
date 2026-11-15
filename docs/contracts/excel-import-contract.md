# Contract — Excel Import

> Domain: excel-import
> Last updated by: excel-import spec, every row left out reported (#621), 2026-11-15

## Commands

### `parse_excel_file` — R1, R2, R3, R4, R5, R6

Parses the Excel file at the given path, which must be an existing `.xlsx` file under the user's home directory. Reads `Patiente`, `Secu`, and monthly sheets. Assigns `temp_id` UUIDs to each entity (R5) and groups procedures by amount to derive `procedure_type_tmp_id` (R6). Validates SSNs (R3) and fund identifiers (R4). Returns skipped lines and missing sheets in `parsing_issues` (R2, R21). Each parse draws new `procedure_type_tmp_id` UUIDs, so a type mapping holds for the parse that produced it only (EXI-070).

- **Args:** `file_path: String`
- **Returns:** `ParseExcelResponse`
- **Errors:** `PathRejected` (missing, outside the home directory, inside the app's data or log folder, wrong extension or not a regular file), `InvalidFormat` (unreadable as xlsx, or above 50 MB), `ParseError`

---

### `execute_excel_import` — R8, R9, R10, R15, R16, R17, R18, R19, R20, R24, R25, PRO-300, EXI-110, EXI-130, EXI-131, EXI-151, EXI-161, EXI-171, EXI-175, EXI-176, EXI-177, EXI-178, EXI-179, EXI-270, EXI-280, EXI-281, EXI-290

Executes the import from a previously parsed response. Resolves and creates patients (R8) and funds (R9). Selection is by sheet (EXI-270): the backend filters rows by `ExcelProcedure.sheet_month` equality against `selected_sheets`. For each selected sheet, checks blocking (R15) on the sheet's nominal month — a blocking status, or a procedure a fund payment line, a bank entry or a procedure refund names (EXI-161) — and lists the non-blocked months to replace (R16), neither under EXI-171; their procedures are deleted before any procedure is created, in one transaction with every other write (EXI-175). Before any write, a mapping naming a type that does not exist (deleted since, or never created) refuses the import, whatever rows use it (EXI-151). For each procedure row in a selected sheet, the orchestrator applies the execute-time validation gates before creation: `procedure_date` and `confirmed_payment_date` must parse (EXI-280), and `procedure_date.month` must equal the sheet's nominal month (EXI-281). Rows of a blocked month, then rows whose patient is not resolved, then those whose amount has no mapping, then those that fail a gate are added — one entry each, the first cause in that order — to `ImportExecutionResult.skipped_procedures` (EXI-290) with the source sheet, row number, and a typed reason (`SkipReason`); the import continues with the remaining rows. Accepted procedures are created in the correct initial status (R19) and patient tracking fields are updated (R18). Procedures whose `procedure_type_tmp_id` is absent from `procedure_type_mapping` are skipped and reported (R25); one mapped to `imported-from-excel` is created with the reserved `import-pdf` type (EXI-131). Returns a detailed result report (R20).

> EXI-070: `parsed_data` and `procedure_type_mapping` come from the same parse.

- **Args:** `parsed_data: ParseExcelResponse, procedure_type_mapping: Map<String, String>, selected_sheets: Vec<String>` — `selected_sheets` carries canonical sheet names (`"Jan"`, `"Fév"`, …) matching `ExcelProcedure.sheet_month`.
- **Returns:** `ImportExecutionResult`
- **Errors:** `ProcedureTypeNotFound { procedure_type_id }` — the mapping names a type that does not exist, deleted since or never created, whatever rows use it (EXI-151); `PatientInvalid`, `FundInvalid` — the domain refused a patient or fund of the workbook (EXI-179); `ImportFailed` — catch-all, a read or a write failed. A skipped row is counted in `procedures_skipped`; one of a selected sheet also gets a `skipped_procedures` entry (EXI-290). On any of them nothing was written (EXI-175). A blocked month or a skipped row is no failure (EXI-176).

---

### `get_excel_amount_mappings` — R23, R24

Returns the user's saved amount → procedure type preferences. Excludes mappings whose procedure type no longer exists (soft-deleted), unless the mapped type is `imported-from-excel` (R24). Used to pre-fill the mapping screen on subsequent imports.

- **Args:** —
- **Returns:** `Vec<ExcelAmountMapping>`
- **Errors:** `DatabaseError` — infrastructure-only; no domain rejection.

---

### `save_excel_amount_mappings` — R22

Persists the user's amount → procedure type choices. Upserted keyed on `amount`. Called when the user confirms the mapping step.

- **Args:** `mappings: Vec<SaveExcelAmountMappingRequest>`
- **Returns:** `()`
- **Errors:** `DatabaseError` — infrastructure-only; no domain rejection.

---

## Shared Types

```rust
// R1, R6 — full parse result; its type mapping holds for it only (EXI-070)
struct ParseExcelResponse {
    patients: Vec<ExcelPatient>,
    funds: Vec<ExcelFund>,
    procedures: Vec<ExcelProcedure>,
    total_records: u32,
    parsing_issues: ParsingIssues,   // R2, R21 — skipped rows + missing sheets
}

struct ExcelPatient {
    temp_id: String,          // R5 — UUID assigned at parse time
    name: String,
    ssn: String,              // may be empty or invalid; see R3
    latest_fund: Option<String>,  // col D, read-only — not persisted at import
}

struct ExcelFund {
    temp_id: String,
    fund_identifier: String,
    fund_name: String,
    fund_address: Option<String>,  // not persisted
}

// R6 — one procedure row from a monthly sheet
struct ExcelProcedure {
    patient_temp_id: String,
    fund_temp_id: Option<String>,
    procedure_type_tmp_id: String,    // UUID shared across all procedures with the same amount
    amount: i64,                      // in thousandths of a euro
    procedure_date: String,           // raw cell text — execute-time parses to NaiveDate (EXI-280)
    sheet_month: String,              // canonical sheet name e.g. "Jan" (EXI-270 — selection key)
    payment_method: Option<String>,   // raw column T value
    confirmed_payment_date: Option<String>,  // raw cell text — execute-time parses when present (EXI-280)
    paid_amount: Option<i64>,
    awaited_amount: Option<i64>,      // ignored at execution (R17)
    source_row: u32,                  // EXI-290 — 1-based row index in the source sheet; transport metadata per IFC-026
}

struct ParsingIssues {
    skipped_rows: Vec<SkippedRow>,   // R2 — lines rejected during parsing
    missing_sheets: Vec<String>,     // R21 — expected monthly sheets not found
}

// On the wire: { "code": "<Variant>", ...params } (EXI-020, EXI-040, EXI-290).
enum SkipReason {
    InsufficientColumns {
        needed: u32,
    },
    MissingPatientName,
    MissingFundIdentifier,
    MissingFundName,
    UnrecognizedDateFormat {
        value: String,
    },
    MissingDate,                // EXI-020 — the date cell is empty
    PatientNotFound {
        name: String,
    },
    FundNotFound {
        identifier: String,
    },
    InvalidAmount {
        value: String,
    },
    InvalidProcedureDate {
        value: String,
    },
    InvalidConfirmedPaymentDate {
        value: String,
    },
    UnknownSheetName,
    DateOutsideSheetMonth {
        date: String,
    },
    UnmappedAmount {            // EXI-150 — no type mapped for this amount
        amount: i64,
    },
    MonthBlocked {              // EXI-160 — the row's month is blocked (YYYY-MM)
        month: String,
    },
    PatientNotResolved,         // EXI-290 — the row's patient matches none of the parse's
}

struct SkippedRow {
    sheet: String,
    row_number: u32,
    reason: SkipReason,
}

// R20 — summary counters returned after execution
struct ImportExecutionResult {
    patients_created: u32,
    patients_reused: u32,
    funds_created: u32,
    funds_reused: u32,
    procedures_created: u32,
    procedures_skipped: u32,            // EXI-210 — execute-time skips only: unselected sheet; and, each also in skipped_procedures, blocked month, unresolved patient, unmapped amount (R25), date gates (EXI-280/281)
    procedures_deleted: u32,
    blocked_months: Vec<String>,        // R15 — YYYY-MM format
    skipped_procedures: Vec<SkippedRow>, // EXI-290 — every skipped row of a selected sheet; merged with the parse's into EXI-220's report on screen today (#429) (reuses the EXI-220 SkippedRow shape)
}

// R22, R23 — a single saved amount → procedure type preference
struct ExcelAmountMapping {
    amount: i64,              // in thousandths of a euro
    procedure_type_id: String,
}

struct SaveExcelAmountMappingRequest {
    amount: i64,
    procedure_type_id: String,
}
```

## Events

| Event              | Trigger (EXI-177)                                     |
| ------------------ | ----------------------------------------------------- |
| `ProcedureUpdated` | `execute_excel_import` deleted or created a procedure |
| `PatientUpdated`   | `execute_excel_import` wrote a patient                |
| `FundUpdated`      | `execute_excel_import` created a fund                 |

Each is raised after the commit, at most once per import; a failed import raises none.

## Changelog

- 2026-11-15 — #621: `ProcedureTypeNotFound` (EXI-151); `SkipReason::MissingDate`, `UnmappedAmount`, `MonthBlocked`, `PatientNotResolved`; every skipped row of a selected sheet in `skipped_procedures`; EXI-161 blocks a month for a bank entry or a procedure refund too.
- 2026-11-14 — #647: the spec holds business rules only; EXI-070 says a mapping holds for its parse, EXI-110 and EXI-130 back `execute_excel_import`; EXI-220's merged, sorted report is assembled on screen today, owed by #429. No signature, type or error change.
- 2026-11-07 — `execute_excel_import` stores the default type `imported-from-excel` as the reserved `import-pdf` type (EXI-131).
- 2026-11-01 — `SkippedRow.reason` documented as the `SkipReason` the wire already carries (EXI-290); EXI-171's exception stated on `execute_excel_import`.
- 2026-05-02 — Added by `excel-import` spec: parse_excel_file, execute_excel_import, get_excel_amount_mappings, save_excel_amount_mappings
- 2026-05-25 — Updated by `excel-import` spec (EXI-270/280/281/290 + IFC-026):
  - `execute_excel_import`: arg `selected_months` → `selected_sheets` (canonical sheet names matching `sheet_month`)
  - `ExcelProcedure`: added `source_row: u32` (transport metadata for execute-time skip reporting)
  - `ImportExecutionResult`: added `skipped_procedures: Vec<SkippedRow>` (execute-time skip report, mirrors parse-time `parsing_issues.skipped_rows`)
- 2026-06-06 — Typed-error migration: all 4 commands return `ExcelImportError` (flat `#[serde(tag = "code")]` enum) instead of `Result<T, String>`. `get_excel_amount_mappings` / `save_excel_amount_mappings` now surface `DatabaseError` on infra failure (previously `Errors: —`).
- 2026-10-24 — `parse_excel_file`: a path inside the app's data or log folder is `PathRejected`, a file above 50 MB `InvalidFormat` (#512).
- 2026-11-01 — `execute_excel_import`: every write is one transaction, so on any error nothing was written (EXI-175, #580); its events are raised after the commit; `PatientInvalid` and `FundInvalid` added (EXI-179).
