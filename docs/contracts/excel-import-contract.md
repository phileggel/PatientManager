# Contract — Excel Import

> Domain: excel-import
> Last updated by: excel-import spec

## Commands

### `parse_excel_file` — R1, R2, R3, R4, R5, R6

Parses the Excel file at the given path, which must be an existing `.xlsx` file under the user's home directory. Reads `Patiente`, `Secu`, and monthly sheets. Assigns `temp_id` UUIDs to each entity (R5) and groups procedures by amount to derive `procedure_type_tmp_id` (R6). Validates SSNs (R3) and fund identifiers (R4). Returns skipped lines and missing sheets in `parsing_issues` (R2, R21). The returned `ParseExcelResponse` must be kept in memory — re-parsing would produce different `procedure_type_tmp_id` UUIDs, invalidating any existing type mapping (R7).

- **Args:** `file_path: String`
- **Returns:** `ParseExcelResponse`
- **Errors:** `PathRejected` (missing, outside the home directory, inside the app's data or log folder, wrong extension or not a regular file), `InvalidFormat` (unreadable as xlsx, or above 50 MB), `ParseError`

---

### `execute_excel_import` — R8, R9, R10, R15, R16, R17, R18, R19, R20, R24, R25, PRO-300, EXI-171, EXI-175, EXI-176, EXI-177, EXI-178, EXI-179, EXI-270, EXI-280, EXI-281, EXI-290

Executes the import from a previously parsed response. Resolves and creates patients (R8) and funds (R9). Selection is by sheet (EXI-270): the backend filters rows by `ExcelProcedure.sheet_month` equality against `selected_sheets`. For each selected sheet, checks blocking (R15) on the sheet's nominal month and lists the non-blocked months to replace (R16); their procedures are deleted before any procedure is created, in one transaction with every other write (EXI-175). For each procedure row in a selected sheet, the orchestrator applies the execute-time validation gates before creation: `procedure_date` and `confirmed_payment_date` must parse (EXI-280), and `procedure_date.month` must equal the sheet's nominal month (EXI-281). Rows that fail any gate are added to `ImportExecutionResult.skipped_procedures` (EXI-290) with the source sheet, row number, and a human-readable reason; the import continues with the remaining rows. Accepted procedures are created in the correct initial status (R19) and patient tracking fields are updated (R18). Procedures whose `procedure_type_tmp_id` is absent from `procedure_type_mapping` are skipped (R25). Returns a detailed result report (R20).

> R7: `parsed_data` must be the original parse response — never re-parsed.

- **Args:** `parsed_data: ParseExcelResponse, procedure_type_mapping: Map<String, String>, selected_sheets: Vec<String>` — `selected_sheets` carries canonical sheet names (`"Jan"`, `"Fév"`, …) matching `ExcelProcedure.sheet_month`.
- **Returns:** `ImportExecutionResult`
- **Errors:** `ImportFailed` — catch-all; a skipped row is counted in `procedures_skipped`, and one failing a date gate also gets a `skipped_procedures` entry (EXI-290). Named variants wait on #366. `ImportFailed` covers what EXI-179 lists. On `ImportFailed` nothing was written (EXI-175). A blocked month or a skipped row is no failure (EXI-176).

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
// R1, R6 — full parse result; held in memory for the lifetime of the import session (R7)
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

struct SkippedRow {
    sheet: String,
    row_number: u32,
    reason: String,
}

// R20 — summary counters returned after execution
struct ImportExecutionResult {
    patients_created: u32,
    patients_reused: u32,
    funds_created: u32,
    funds_reused: u32,
    procedures_created: u32,
    procedures_skipped: u32,            // count covers BOTH parse-time skips (R25 amount-mapping) AND execute-time skips (EXI-280/281, also surfaced in skipped_procedures)
    procedures_deleted: u32,
    blocked_months: Vec<String>,        // R15 — YYYY-MM format
    skipped_procedures: Vec<SkippedRow>, // EXI-290 — per-row execute-time skip report (reuses the EXI-220 SkippedRow shape)
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

- 2026-05-02 — Added by `excel-import` spec: parse_excel_file, execute_excel_import, get_excel_amount_mappings, save_excel_amount_mappings
- 2026-05-25 — Updated by `excel-import` spec (EXI-270/280/281/290 + IFC-026):
  - `execute_excel_import`: arg `selected_months` → `selected_sheets` (canonical sheet names matching `sheet_month`)
  - `ExcelProcedure`: added `source_row: u32` (transport metadata for execute-time skip reporting)
  - `ImportExecutionResult`: added `skipped_procedures: Vec<SkippedRow>` (execute-time skip report, mirrors parse-time `parsing_issues.skipped_rows`)
- 2026-06-06 — Typed-error migration: all 4 commands return `ExcelImportError` (flat `#[serde(tag = "code")]` enum) instead of `Result<T, String>`. `get_excel_amount_mappings` / `save_excel_amount_mappings` now surface `DatabaseError` on infra failure (previously `Errors: —`).
- 2026-10-24 — `parse_excel_file`: a path inside the app's data or log folder is `PathRejected`, a file above 50 MB `InvalidFormat` (#512).
- 2026-11-01 — `execute_excel_import`: every write is one transaction, so on `ImportFailed` nothing was written (EXI-175, #580); its events are raised after the commit.
