# Contract — Bank Statement Auto-Match

> Domain: bank-statement-auto-match
> Last updated by: bank-reconciliation draft-UX rework (BAS-060–102)

> Wire errors are the composite `BankStatementReconciliationError` (untagged union of `BankError`, `FundError`, and the use-case `BankStatementReconciliationTask`). Each variant serializes as `{ "code": "<Variant>", ... }`; the rows below list the codes reachable per command. `DatabaseError` is the shared infra catch-all and may surface on any command that touches a repository.

## Commands

### `parse_bank_statement` — R2, R3, R26

Step 1 of the workflow. Reads the PDF bank statement from the given file path, extracts the IBAN, statement period, and VIR SEPA credit lines (R3 — other line types are ignored). Returns a structured `NoVirSepaLines` error if no VIR SEPA entries remain after filtering — the workflow must stop at this point (R26).

- **Args:** `file_path: String`
- **Returns:** `BankStatementParseResult`
- **Errors:** `PathRejected`, `PdfExtractionFailed`, `NoSepaCreditLines` (R26), `HomeDirUnresolved`

---

### `resolve_bank_account_from_iban` — BAS-010

Resolves the practitioner's `BankAccount` from the IBAN extracted by `parse_bank_statement`. Returns `None` if no account matches — the frontend then drives the inline create flow (BAS-011..017) by calling `create_bank_account` directly via the bank-account gateway, then proceeds to label-mapping with the new account.

> `Ok(None)` is intentional here, not a gap. An unregistered IBAN is a valid, expected workflow state (the user is offered the inline create form). This is distinct from `read_bank_account` which raises `NotFound` because a missing ID would indicate a data integrity problem.

- **Args:** `iban: String`
- **Returns:** `Option<BankAccount>`
- **Errors:** `DatabaseError`

---

### `resolve_bank_fund_labels` — R5, R6, R8 — **SUPERSEDED** by `compute_bank_statement_reconciliation`

> Absorbed into the reconciliation engine: the initial reconciliation applies saved mappings + heuristic suggestions itself, and each needs-link line carries its suggestion. No longer a separate frontend command.

Step 3 of the workflow. For each raw label extracted from the statement, looks up any saved mapping for this bank account (pre-fill, R5) and runs the heuristic fund-matching algorithm for unknown labels (suggestion, R6). Rejected labels are flagged via `is_rejected` (R8). Always called after `resolve_bank_account_from_iban` succeeds.

- **Args:** `bank_account_id: String, labels: Vec<String>`
- **Returns:** `Vec<FundLabelResolution>`
- **Errors:** `DatabaseError`

---

### `save_bank_fund_label_mappings` — R9 — **SUPERSEDED** by `validate_bank_statement_reconciliation`

> Mapping upsert now happens at validate (BAS-035), atomic with the commit. No separate save step.

Persists the full set of label→fund assignments validated by the user at the mapping step. Each entry is upserted keyed on `(bank_account_id, bank_label)`. Rejected labels are stored as `"REJECTED"` (converted to NULL in the DB). Always called before `match_bank_statement_lines`.

- **Args:** `bank_account_id: String, mappings: Vec<SaveLabelMappingRequest>`
- **Returns:** `()`
- **Errors:** `DatabaseError`

---

### `match_bank_statement_lines` — R10, R11, R12, R13, R14 — **SUPERSEDED** by `compute_bank_statement_reconciliation`

> The auto-match runs inside the reconciliation computation (initial pass, before corrections). No longer a separate frontend command.

Pure in-memory matching algorithm — no DB writes. Sorts resolved credit lines by ascending date (R12), then matches each line against unsettled `FundPaymentGroup`s on three criteria: same fund, equal amount, bank date within the date tolerance window (R10, R11). Each line and group can only be matched once (R14). Already bank-reconciled groups are excluded (R13). Returns matched and unmatched lines for user review.

- **Args:** `resolved_lines: Vec<ResolvedCreditLine>`
- **Returns:** `BankStatementMatchResult`
- **Errors:** `DatabaseError`

---

### `create_bank_transfers_from_statement` — R19, R20, R21, R22 — **SUPERSEDED** by `validate_bank_statement_reconciliation`

> Replaced by validate, which recomputes the reconciliation server-side from `corrections[]`, upserts label mappings, and creates N transfers per multi-group line (BAS-093). Never trusts an FE-supplied match list.

Final step. For each confirmed match, creates one `BankEntry` (R19), updates all procedures in the group to their terminal status (`FundPaid` / `PartiallyFundPaid`, R20), and locks the group (`BankPaid`, R21–R22). Returns the count of `BankEntry` records created.

> ⚠️ UL discrepancy: command name uses "bank_transfers" but the UL term is `BankEntry` (code rename pending).

- **Args:** `bank_account_id: String, confirmed_matches: Vec<ConfirmedMatch>`
- **Returns:** `u32` — count of `BankEntry` records created
- **Errors:** `InvalidConfirmedMatchDate`, `AmountNotPositive`, `BankAccountNotFound`, `InvalidTransferDateFormat`, `DatabaseError`

---

### `get_bank_statement_reconciliation_config` — R11

Returns the backend matching configuration. Used by the frontend for two purposes: display the date tolerance in the match-review column header (R15), and apply it client-side in the broadened search filter (R17). Infallible — driven by a compile-time constant.

- **Args:** —
- **Returns:** `BankStatementReconciliationConfig`
- **Errors:** —

---

### `compute_bank_statement_reconciliation` — BAS-060–069, BAS-090–092, BAS-094

The reconciliation engine. Computes the full bank-statement reconciliation as a pure function of the parsed statement plus an ordered list of correction commands. Reads live unsettled `FundPaymentGroup`s and saved label mappings, applies heuristic suggestions, runs the auto-match (BAS-050–054) for the initial pass, then **replays every correction in order** — link-fund cascade (BAS-066), group assignment with consumption (BAS-067, BAS-090), remainder acknowledgment (BAS-092) — re-deriving each line's status and candidate proposals. Read-only: no DB writes; the reconciliation is never persisted (ephemeral, BAS-064). The frontend re-calls this on every correction and every revert (BAS-065 = drop a command and recompute).

- **Args:** `bank_account_id: String, parse_result: BankStatementParseResult, corrections: Vec<BankStatementCorrection>`
- **Returns:** `BankStatementReconciliation`
- **Errors:** `AssignmentOverflow` (BAS-094 — assigned groups exceed the line amount), `GroupNotEligible` (BAS-090 — group fails fund/date/already-settled criteria), `GroupAlreadyConsumed` (BAS-067 — group assigned to another line), `LineNotFound`, `FundNotFound`, `DatabaseError`

---

### `validate_bank_statement_reconciliation` — BAS-063, BAS-035, BAS-070–073, BAS-093

Commits the reconciliation. **Recomputes the reconciliation server-side** from `corrections[]` (never trusts FE-side state), then in one pass: upserts the label mappings implied by link-fund corrections (BAS-035), and for every resolved line creates one `BankEntry` per assigned group (N per multi-group line, BAS-093), moves the group's procedures to their terminal status (`FundPaid` / `PartiallyFundPaid`, BAS-071), and locks the group (`BankPaid`, BAS-072–073). Unresolved/needs-\* lines are skipped (BAS-063); acknowledged remainders create nothing (BAS-092). Writes are **not** wrapped in a single transaction (deferred UoW — see spec Accepted Limitations / ADR-003). Returns the count of `BankEntry` records created.

- **Args:** `bank_account_id: String, parse_result: BankStatementParseResult, corrections: Vec<BankStatementCorrection>`
- **Returns:** `u32` — count of `BankEntry` records created
- **Errors:** `AssignmentOverflow`, `GroupNotEligible`, `GroupAlreadyConsumed`, `BankAccountNotFound`, `AmountNotPositive`, `InvalidTransferDateFormat`, `FundNotFound`, `DatabaseError`

---

## Shared Types

```rust
struct BankStatementParseResult {
    iban: Option<String>,                      // absent if not found in PDF header
    period: Option<String>,                    // statement period label e.g. "du 01/05/2025 au 30/05/2025"
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
    fund_id: Option<String>,              // confirmed fund ID from the mapping table; absent = no saved mapping
    suggested_fund_id: Option<String>,    // heuristic candidate (R6); informational only, never pre-selected (R28)
    suggested_fund_name: Option<String>,  // display name for the heuristic suggestion
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

// BAS-060–102: reconciliation model — all of the following are ephemeral (never persisted)

// One user correction, replayed in order by compute_bank_statement_reconciliation / validate.
// Reverting a correction = removing it from the list and recomputing (BAS-065).
enum BankStatementCorrection {
    LinkFund { bank_label: String, assignment: FundAssignment }, // BAS-066, BAS-030
    AssignGroups { line_id: String, group_ids: Vec<String> },    // 1..N groups; empty = unassign/override auto-match (BAS-062, BAS-090)
    AcknowledgeRemainder { line_id: String },                    // mark the uncovered portion accepted (BAS-092)
}

// BAS-030/066 — a label is linked to a fund, or explicitly marked not-a-fund-payment.
// Typed variant rather than a "REJECTED" string sentinel (tightens the ADR-001 weakness on this new surface).
enum FundAssignment {
    Fund { fund_id: String },
    Rejected,
}

// The recomputed reconciliation state: every statement line with its resolved status.
struct BankStatementReconciliation {
    lines: Vec<BankStatementLine>,
    resolved_count: u32,        // BAS-069 — running summary
    needs_correction_count: u32,
}

// One bank credit line within the reconciliation, in document order (BAS-060).
struct BankStatementLine {
    line_id: String,            // stable id for the line within this reconciliation session
    credit_line: BankStatementCreditLine,
    status: BankStatementLineStatus,    // BAS-061
    fund_id: Option<String>,    // resolved fund once linked; absent while needs-link
    assigned_group_ids: Vec<String>,  // BAS-090 — 0..N
    covered_amount: i64,        // BAS-091 — Σ assigned group amounts
    remainder_acknowledged: bool,     // BAS-092
    candidate_groups: Vec<BankStatementCandidate>, // BAS-068 — ranked proposals for needs-group/partial, fund-filtered (default view)
    broadened_candidates: Vec<BankStatementCandidate>, // BAS-068 — same proposals across ALL funds (date tolerance kept); shown on "broaden"
    suggested_fund_id: Option<String>,     // BAS-066/032 — heuristic, for the link-fund modal
    suggested_fund_name: Option<String>,
}

// BAS-061 — the per-line status set
enum BankStatementLineStatus {
    Matched,     // auto-matched or fully assigned (covered == line amount)
    NeedsLink,   // label not yet linked to a fund
    NeedsGroup,  // fund known, no group assigned
    Partial,     // some groups assigned, line not yet fully covered
    Rejected,    // label marked not-a-fund-payment (BAS-030)
    Unresolved,  // linked but no eligible group and not acknowledged
}

// BAS-068 — a ranked candidate group for an unresolved/partial line
struct BankStatementCandidate {
    group_id: String,
    fund_id: String,
    payment_date: String,
    total_amount: i64,
    is_exact_amount: bool,      // exact match against the line's outstanding amount (ranked first)
}
```

## Events

| Event                     | Trigger                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `ProcedureUpdated`        | After `validate_bank_statement_reconciliation` — procedures move to `FundPaid` / `PartiallyFundPaid` (BAS-071)     |
| `BankEntryUpdated`        | After `validate_bank_statement_reconciliation` — new `BankEntry` records created, N per multi-group line (BAS-093) |
| `FundPaymentGroupUpdated` | After `validate_bank_statement_reconciliation` — settled groups move to `BankPaid` and lock (BAS-072–073)          |

## Changelog

- 2026-04-29 — Added by `bank-statement-auto-match` spec: parse_bank_statement, resolve_bank_account_from_iban, resolve_bank_fund_labels, save_bank_fund_label_mappings, match_bank_statement_lines, create_bank_transfers_from_statement, get_bank_statement_reconciliation_config
- 2026-04-29 — Deep review applied: added per-command intent and spec rule tracing, UL discrepancy note on create_bank_transfers_from_statement, GroupNotFound and InvalidDateFormat errors, ConfirmedMatch field origins, get_bank_statement_reconciliation_config frontend usage documented
- 2026-05-04 — Inline create flow (BAS-011..017): resolve_bank_account_from_iban description updated — `None` now drives the frontend inline create form rather than a dead-end. Rule reference R1 → BAS-010. No new commands; uses existing `create_bank_account` (see bank-contract.md).
- 2026-06-09 — Typed-error migration: per-command Errors columns now list the real wire-visible `BankStatementReconciliationError` variant codes (`BankError`/`FundError`/`BankStatementReconciliationTask`), replacing the pre-implementation aspirational names. `NoVirSepaLines` → `NoSepaCreditLines`.
- 2026-06-20 — Draft-UX rework (BAS-060–102): added `compute_bank_statement_reconciliation` and `validate_bank_statement_reconciliation`; superseded `resolve_bank_fund_labels`, `save_bank_fund_label_mappings`, `match_bank_statement_lines`, `create_bank_transfers_from_statement` (absorbed into the two new commands — collapse confirmed by user). Added reconciliation types (`BankStatementCorrection`, `BankStatementReconciliation`, `BankStatementLine`, `BankStatementLineStatus`, `BankStatementCandidate`), new error variants (`AssignmentOverflow`, `GroupNotEligible`, `GroupAlreadyConsumed`), and `FundPaymentGroupUpdated` event. Validate recomputes server-side from `corrections[]`; writes non-atomic (deferred UoW). `LinkFund` uses a typed `FundAssignment` (`Fund | Rejected`) instead of a `"REJECTED"` string sentinel; `AssignGroups` with an empty set means unassign / override an auto-match (BAS-062).
