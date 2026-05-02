# Contract — Excel Import

> Domain: excel-import
> Last updated by: excel-import spec

## Commands

### `parse_excel_file` — R1, R2, R3, R4, R5, R6

Parses the Excel file at the given path. Reads `Patiente`, `Secu`, and monthly sheets. Assigns `temp_id` UUIDs to each entity (R5) and groups procedures by amount to derive `procedure_type_tmp_id` (R6). Validates SSNs (R3) and fund identifiers (R4). Returns skipped lines and missing sheets in `parsing_issues` (R2, R21). The returned `ParseExcelResponse` must be kept in memory — re-parsing would produce different `procedure_type_tmp_id` UUIDs, invalidating any existing type mapping (R7).

- **Args:** `file_path: String`
- **Returns:** `ParseExcelResponse`
- **Errors:** `FileNotFound`, `InvalidFormat`, `ParseError`

---

### `execute_excel_import` — R8, R9, R10, R15, R16, R17, R18, R19, R20, R24, R25

Executes the import from a previously parsed response. Resolves and creates patients (R8) and funds (R9), checks each selected month for blocked procedures (R15), deletes non-blocked month procedures (R16), and creates new procedures in the correct initial status (R19). Updates patient tracking fields after creation (R18). Procedures whose `procedure_type_tmp_id` is absent from `procedure_type_mapping` are skipped (R25). Returns a detailed result report (R20).

> R7: `parsed_data` must be the original parse response — never re-parsed.

- **Args:** `parsed_data: ParseExcelResponse, procedure_type_mapping: Map<String, String>, selected_months: Vec<String>`
- **Returns:** `ImportExecutionResult`
- **Errors:** `ImportFailed`

---

### `get_excel_amount_mappings` — R23, R24

Returns the user's saved amount → procedure type preferences. Excludes mappings whose procedure type no longer exists (soft-deleted), unless the mapped type is `imported-from-excel` (R24). Used to pre-fill the mapping screen on subsequent imports.

- **Args:** —
- **Returns:** `Vec<ExcelAmountMapping>`
- **Errors:** —

---

### `save_excel_amount_mappings` — R22

Persists the user's amount → procedure type choices. Upserted keyed on `amount`. Called when the user confirms the mapping step.

- **Args:** `mappings: Vec<SaveExcelAmountMappingRequest>`
- **Returns:** `()`
- **Errors:** —

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
    latest_fund: String,      // optional; col D, read-only — not persisted at import
}

struct ExcelFund {
    temp_id: String,
    fund_identifier: String,
    fund_name: String,
    fund_address: String,     // optional; not persisted
}

// R6 — one procedure row from a monthly sheet
struct ExcelProcedure {
    patient_temp_id: String,
    fund_temp_id: String,             // optional
    procedure_type_tmp_id: String,    // UUID shared across all procedures with the same amount
    amount: i64,                      // in thousandths of a euro
    procedure_date: String,           // ISO date YYYY-MM-DD
    sheet_month: String,              // sheet name e.g. "Jan"
    payment_method: String,           // optional; raw column T value
    confirmed_payment_date: String,   // optional
    paid_amount: i64,                 // optional
    awaited_amount: i64,              // optional; ignored at execution (R17)
}

struct ParsingIssues {
    skipped_rows: Vec<SkippedRow>,   // R2 — lines rejected during parsing
    missing_sheets: String,          // optional; R21 — expected monthly sheets not found
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
    procedures_skipped: u32,
    procedures_deleted: u32,
    blocked_months: Vec<String>,   // R15 — YYYY-MM format
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

| Event              | Trigger                                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| `ProcedureUpdated` | After `execute_excel_import` — procedures created or deleted (R16, R17) |

## Changelog

- 2026-05-02 — Added by `excel-import` spec: parse_excel_file, execute_excel_import, get_excel_amount_mappings, save_excel_amount_mappings
