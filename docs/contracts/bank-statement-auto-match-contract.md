# Contract — Bank Statement Auto-Match

> Domain: bank-statement-auto-match
> Last updated by: bank-statement-auto-match spec

## Commands

### `parse_bank_statement` — R2, R3, R26

Step 1 of the workflow. Parses a PDF bank statement from raw bytes, extracts the IBAN, statement period, and VIR SEPA credit lines (R3 — other line types are ignored). Returns a structured `NoVirSepaLines` error if no VIR SEPA entries remain after filtering — the workflow must stop at this point (R26).

- **Args:** `bytes: Vec<u8>`
- **Returns:** `BankStatementParseResult`
- **Errors:** `PdfExtractionFailed`, `NoVirSepaLines`

---

### `resolve_bank_account_from_iban` — BAS-010

Resolves the practitioner's `BankAccount` from the IBAN extracted by `parse_bank_statement`. Returns `None` if no account matches — the frontend then drives the inline create flow (BAS-011..017) by calling `create_bank_account` directly via the bank-account gateway, then proceeds to label-mapping with the new account.

> `None` is intentional here, not a gap. An unregistered IBAN is a valid, expected workflow state (the user is offered the inline create form). This is distinct from `read_bank_account` which raises `NotFound` because a missing ID would indicate a data integrity problem.

- **Args:** `iban: String`
- **Returns:** `Option<BankAccount>`
- **Errors:** —

---

### `resolve_bank_fund_labels` — R5, R6, R8

Step 3 of the workflow. For each raw label extracted from the statement, looks up any saved mapping for this bank account (pre-fill, R5) and runs the heuristic fund-matching algorithm for unknown labels (suggestion, R6). Rejected labels are flagged via `is_rejected` (R8). Always called after `resolve_bank_account_from_iban` succeeds.

- **Args:** `bank_account_id: String, labels: Vec<String>`
- **Returns:** `Vec<FundLabelResolution>`
- **Errors:** `AccountNotFound`

---

### `save_bank_fund_label_mappings` — R9

Persists the full set of label→fund assignments validated by the user at the mapping step. Each entry is upserted keyed on `(bank_account_id, bank_label)`. Rejected labels are stored as `"REJECTED"` (converted to NULL in the DB). Always called before `match_bank_statement_lines`.

- **Args:** `bank_account_id: String, mappings: Vec<SaveLabelMappingRequest>`
- **Returns:** `()`
- **Errors:** `AccountNotFound`

---

### `match_bank_statement_lines` — R10, R11, R12, R13, R14

Pure in-memory matching algorithm — no DB writes. Sorts resolved credit lines by ascending date (R12), then matches each line against unsettled `FundPaymentGroup`s on three criteria: same fund, equal amount, bank date within the date tolerance window (R10, R11). Each line and group can only be matched once (R14). Already bank-reconciled groups are excluded (R13). Returns matched and unmatched lines for user review.

- **Args:** `resolved_lines: Vec<ResolvedCreditLine>`
- **Returns:** `BankStatementMatchResult`
- **Errors:** —

---

### `create_bank_transfers_from_statement` — R19, R20, R21, R22

Final step. For each confirmed match, creates one `BankEntry` (R19), updates all procedures in the group to their terminal status (`FundPaid` / `PartiallyFundPaid`, R20), and locks the group (`BankPaid`, R21–R22). Returns the count of `BankEntry` records created.

> ⚠️ UL discrepancy: command name uses "bank_transfers" but the UL term is `BankEntry` (code rename pending).

- **Args:** `bank_account_id: String, confirmed_matches: Vec<ConfirmedMatch>`
- **Returns:** `u32` — count of `BankEntry` records created
- **Errors:** `AccountNotFound`, `GroupNotFound`, `InvalidDateFormat`

---

### `get_bank_statement_reconciliation_config` — R11

Returns the backend matching configuration. Used by the frontend for two purposes: display the date tolerance in the match-review column header (R15), and apply it client-side in the broadened search filter (R17). Infallible — driven by a compile-time constant.

- **Args:** —
- **Returns:** `BankStatementReconciliationConfig`
- **Errors:** —

---

## Shared Types

```rust
struct BankStatementParseResult {
    iban: String,                              // optional; absent if not found in PDF header
    period: String,                            // optional; statement period label e.g. "du 01/05/2025 au 30/05/2025"
    credit_lines: Vec<BankStatementCreditLine>,
    total_credits: i64,                        // sum of all VIR SEPA credit amounts in thousandths of a euro
    unparsed_count: u32,                       // R4: lines the parser could not recognise; shown as a warning to the user
}

struct BankStatementCreditLine {
    date: String,    // ISO date YYYY-MM-DD
    label: String,   // fund label as it appears on the statement, e.g. "CPAM93"
    amount: i64,     // credit amount in thousandths of a euro
}

// R5, R6, R8: resolution of a single bank label against the saved mapping table
struct FundLabelResolution {
    bank_label: String,
    fund_id: String,              // optional; confirmed fund ID from the mapping table; absent = no saved mapping
    suggested_fund_id: String,    // optional; heuristic candidate (R6); informational only, never pre-selected (R28)
    suggested_fund_name: String,  // optional; display name for the heuristic suggestion
    is_confirmed: bool,           // true = value comes from the saved mapping table (R5)
    is_rejected: bool,            // true = label is explicitly marked as not a fund payment (R8)
}

// R9: one label→fund assignment submitted by the user at the mapping step
// fund_id is the wire-format sentinel for rejection; "REJECTED" means the label is not a fund payment
// (stored as NULL in the DB; filtered out before matching)
struct SaveLabelMappingRequest {
    bank_label: String,
    fund_id: String,   // fund UUID, or "REJECTED" to mark as not a fund payment
}

// R10: a bank credit line after fund assignment, ready for the matching algorithm
struct ResolvedCreditLine {
    date: String,
    label: String,
    amount: i64,      // in thousandths of a euro
    fund_id: String,  // fund UUID, or "REJECTED" (excluded from matching by the algorithm)
}

// R10–R14: one candidate match between a credit line and a FundPaymentGroup
// group_payment_date and group_total_amount are included for display in the user review step (R15)
struct BankStatementMatch {
    credit_line: ResolvedCreditLine,
    group_id: String,
    group_fund_id: String,
    group_payment_date: String,   // payment date of the FundPaymentGroup; shown in the review table
    group_total_amount: i64,      // total amount of the FundPaymentGroup; shown in the review table
}

struct BankStatementMatchResult {
    matched: Vec<BankStatementMatch>,
    unmatched_lines: Vec<ResolvedCreditLine>,
}

// R19: a user-confirmed match ready for BankEntry creation
// date and amount come from the matched credit line (not the group); used to create the BankEntry record
struct ConfirmedMatch {
    group_id: String,
    date: String,    // bank credit line date; becomes the BankEntry date
    amount: i64,     // bank credit line amount; becomes the BankEntry amount
}

// R11: date tolerance configuration — driven by a compile-time constant on the backend
struct BankStatementReconciliationConfig {
    max_date_offset_days: i32,   // maximum days the bank date may follow the group payment date
}
```

## Events

| Event              | Trigger                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| `ProcedureUpdated` | After `create_bank_transfers_from_statement` — procedures move to `FundPaid` / `PartiallyFundPaid` (R20) |
| `BankEntryUpdated` | After `create_bank_transfers_from_statement` — new `BankEntry` records created (R19)                     |

## Changelog

- 2026-04-29 — Added by `bank-statement-auto-match` spec: parse_bank_statement, resolve_bank_account_from_iban, resolve_bank_fund_labels, save_bank_fund_label_mappings, match_bank_statement_lines, create_bank_transfers_from_statement, get_bank_statement_reconciliation_config
- 2026-04-29 — Deep review applied: added per-command intent and spec rule tracing, UL discrepancy note on create_bank_transfers_from_statement, GroupNotFound and InvalidDateFormat errors, ConfirmedMatch field origins, get_bank_statement_reconciliation_config frontend usage documented
- 2026-05-04 — Inline create flow (BAS-011..017): resolve_bank_account_from_iban description updated — `None` now drives the frontend inline create form rather than a dead-end. Rule reference R1 → BAS-010. No new commands; uses existing `create_bank_account` (see bank-contract.md).
