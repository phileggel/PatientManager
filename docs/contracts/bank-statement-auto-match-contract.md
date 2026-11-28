# Contract — Bank Statement Auto-Match

> Domain: bank-statement-auto-match
> Last updated by: `bank-statement-auto-match` spec (#741), 2026-11-28

> Wire errors are the composite `BankStatementReconciliationError` (untagged union of `BankError`, `FundError`, and the use-case `BankStatementReconciliationTask`). Each variant serializes as `{ "code": "<Variant>", ... }`; the rows below list the codes reachable per command. `DatabaseError` is the shared infra catch-all and may surface on any command that touches a repository.

## Commands

### `parse_bank_statement` — R2, R3, R26

Step 1 of the workflow. Reads the PDF bank statement from the given file path, extracts the IBAN, statement period, and VIR SEPA credit lines (R3 — other line types are ignored). Returns a structured `NoSepaCreditLines` error if no VIR SEPA entries remain after filtering — the workflow must stop at this point (R26).

- **Args:** `file_path: String`
- **Returns:** `BankStatementParseResult`
- **Errors:** `PathRejected`, `PdfExtractionFailed`, `NoSepaCreditLines` (R26), `HomeDirUnresolved`

---

### `resolve_bank_account_from_iban` — BAS-010

Resolves the practitioner's `BankAccount` from the IBAN extracted by `parse_bank_statement`. Returns `None` if no account matches; an account can then be created for that IBAN with `create_bank_account` (BAC-020), and the import goes on with it.

> `Ok(None)` is intentional here, not a gap. An unregistered IBAN is a valid, expected workflow state (an account can be created for it, BAC-020). This is distinct from `read_bank_account` which raises `NotFound` because a missing ID would indicate a data integrity problem.

- **Args:** `iban: String`
- **Returns:** `Option<BankAccount>` (type defined in `bank-contract.md`)
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

### `get_bank_statement_reconciliation_config` — R11 — **SUPERSEDED**

Superseded by the draft-UX rework (BAS-060–102): broadening moved server-side, then went with the cross-fund match (#695), so no frontend consumer of the config remains. The command was never implemented. _(Marked 2026-07-30 — spec-checker found it listed active with zero implementation.)_

---

### `compute_bank_statement_reconciliation` — BAS-030–032, BAS-036, BAS-041D, BAS-060–068, BAS-090–092, BAS-094, BAS-112–113, BAS-117

The reconciliation engine. Computes the full bank-statement reconciliation as a pure function of the parsed statement plus an ordered list of correction commands. A saved label whose fund is gone is not a known label, so it is asked again (BAS-041D). Reads live unsettled `FundPaymentGroup`s, saved label mappings, and — for linked lines — the fund's **open procedures with patient display names** (BAS-112 predicate: line's fund, `payment_status == Created`, in no active fund-payment-group line, positive billed amount; ordered oldest procedure date first, id tiebreak). Applies heuristic suggestions, runs the auto-match (BAS-050–054), then **replays the corrections in order**, each replacing what an earlier one set (BAS-064A) — link-fund cascade (BAS-066): a link to another fund, or a rejection, starts the label's lines again — every correction on them dropped, their groups and procedures released, its lines re-matched on a fund link only — never refused for what it drops (BAS-066B); every other free line is re-attempted either way (BAS-066A); a link to the same fund, or a rejection of a rejected label, drops nothing, the auto-match still re-attempted on every line with no settlement item and no hold (BAS-062A, BAS-066C, BAS-066A), except as BAS-066D says: a line a re-attempt matches drops the remainder acknowledged on it with no assignment; group assignment with consumption, the line's fund only (BAS-067, BAS-090, BAS-090A), procedure assignment with consumption and per-line group/procedure mutual exclusion — one kind replaces the other, never an error (BAS-113), remainder acknowledgment (BAS-092; applying either assignment kind resets a previously acknowledged remainder — its implied size changed, BAS-113; a zero-item acknowledgment resolves the line as left aside, BAS-123B) — re-deriving each line's status, candidate groups, and candidate procedures, and the recap — a view of the lines for the screen, no business rule of its own (owner, 2026-11-15). Read-only: no DB writes; the reconciliation is never persisted (ephemeral, BAS-064). The frontend re-calls this with the corrections made so far, in order.

- **Args:** `bank_account_id: String, parse_result: BankStatementParseResult, corrections: Vec<BankStatementCorrection>`
- **Returns:** `BankStatementReconciliation`
- **Errors:** `AssignmentOverflow` (BAS-094 — assigned items exceed the line amount, either kind), `GroupNotEligible` (BAS-090, BAS-090A — group unknown, of another fund than the line's, or failing lock/settled criteria, or the line not linked to a fund, BAS-064), `GroupAlreadyConsumed` (BAS-067 — group assigned to another line), `ProcedureNotEligible` (BAS-113 — procedure unknown, soft-deleted, not open, or not of the line's fund; subsumes not-found, no separate `ProcedureNotFound`; or the line not linked to a fund, BAS-064), `ProcedureAlreadyConsumed` (BAS-113 — procedure assigned to another line), `LineNotFound`, `FundNotFound`, `DatabaseError`

---

### `validate_bank_statement_reconciliation` — BAS-063, BAS-063A, BAS-035, BAS-053A–C, BAS-070–073, BAS-093, BAS-115, BAS-117

Commits the reconciliation. An unknown account — a deleted one, or a technical one (BAC-055A) — is refused with `BankAccountNotFound` before anything is written (BAS-063A). **Recomputes the reconciliation server-side** from `corrections[]` (never trusts FE-side state), then in one pass: upserts the label mappings implied by link-fund corrections (BAS-035); for every line resolved **via procedures**, first births the `FundPaymentGroup` per the BAS-115 field mapping (fund = line fund, payment date = bank line date, total = Σ billed, one group line per procedure, born `Active`, then `BankPaid` + locked by the settle step, BAS-115) — because validate recomputes, a procedure that stopped being open since the draft was computed re-fails the BAS-112 predicate here (`ProcedureNotEligible`), so a stale draft can never birth an invalid group; then for every resolved line creates one `BankEntry` per assigned group (N per multi-group line, BAS-093; exactly one for a born group), moves the procedures to their terminal status (`FundPaid` / `PartiallyFundPaid` per BAS-071, or `Created` → `FundPaid` for the born path per BAS-115), and locks the group (`BankPaid`, BAS-072–073). Unresolved/needs-\* lines are skipped (BAS-063); acknowledged remainders create nothing (BAS-092). A `NoProceduresSelected`-style input is impossible by construction — an empty set is an unassign, and the line is then not Matched. Writes are **not** wrapped in a single transaction (deferred UoW — see spec Accepted Limitations / ADR-003, widened by the born-group writes); any failure aborts loudly with a typed error, never a silent success count. Returns the count of `BankEntry` records created.

- **Args:** `bank_account_id: String, parse_result: BankStatementParseResult, corrections: Vec<BankStatementCorrection>`
- **Returns:** `u32` — count of `BankEntry` records created
- **Errors:** `AssignmentOverflow`, `GroupNotEligible`, `GroupAlreadyConsumed`, `ProcedureNotEligible` (BAS-112/113/115 — incl. the stale-draft recheck above), `ProcedureAlreadyConsumed`, `BankAccountNotFound`, `AmountNotPositive`, `InvalidTransferDateFormat`, `FundNotFound`, `LineNotFound` (stale correction line id — validate replays the same corrections), `PaymentGroupNotFound`, `BankPaymentAlreadyConfirmed { fund_payment_group_id }` (BSM-037, defensive: a group `BankPaid` but not locked, which no flow leaves, answered after its entry and link are written; a locked group answers `GroupNotEligible` at the recompute, and a group already linked `DatabaseError` at its link, BSM-038), `DatabaseError` (incl. born-group persistence failures — group/line creation, lock, batch update)

---

### `list_bank_label_mappings` — BAS-041, BAS-041A, BAS-041D

Every saved label → fund mapping of every bank account, ordered by account name, then label (BAS-041A; today by account id, the frontend sorting by name — #683); a mapping whose fund is gone is left out (BAS-041D). Read-only; feeds the management screen's « Libellés bancaires » section.

- **Args:** none
- **Returns:** `Vec<BankFundLabelMapping>`
- **Errors:** `DatabaseError`

---

### `reassign_bank_label_mapping` — BAS-042, BAS-044

Sets a saved mapping's assignment to another fund or to rejected (BAS-030). The account and label never change. The new value pre-fills the next import of that account (BAS-031).

- **Args:** `id: String, assignment: FundAssignment`
- **Returns:** `BankFundLabelMapping` (after the change)
- **Errors:** `LabelMappingNotFound` (BAS-044), `FundNotFound` (unknown fund), `DatabaseError`

---

### `delete_bank_label_mapping` — BAS-043, BAS-044

Really deletes a saved bank statement label. The label is unknown again at the next import of that account (BAS-036, BAS-032); a later import may save it anew.

- **Args:** `id: String`
- **Returns:** `()`
- **Errors:** `LabelMappingNotFound` (BAS-044), `DatabaseError`

---

## Shared Types

```rust
// BAS-031, BAS-041 — a saved label → fund mapping; `fund_id: None` = rejected (BAS-030)
struct BankFundLabelMapping {
    id: String,
    bank_account_id: String,
    bank_label: String,
    fund_id: Option<String>,
}
```

```rust
struct BankStatementParseResult {
    iban: Option<String>,                      // absent if not found in PDF header
    period: Option<String>,                    // statement period label e.g. "du 01/05/2025 au 30/05/2025"
    credit_lines: Vec<BankStatementCreditLine>,
    total_credits: i64,                        // sum of all VIR SEPA credit amounts in thousandths of a euro
    unparsed_count: u32,                       // R4 (BAS-022): VIR SEPA lines the parser could not read
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
    suggested_fund_id: Option<String>,    // heuristic candidate (R6); informational only, never the label's assignment (BAS-036)
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

// BAS-060–068, BAS-090–094, BAS-112–113: reconciliation model — all of the following are ephemeral (never persisted)

// One user correction, replayed in order by compute_bank_statement_reconciliation / validate;
// each replaces what an earlier one set on its line or label (BAS-064A).
enum BankStatementCorrection {
    LinkFund { bank_label: String, assignment: FundAssignment }, // BAS-066, BAS-030
    AssignGroups { line_id: String, group_ids: Vec<String> },    // 1..N groups; empty = unassign/override auto-match (BAS-062, BAS-090)
    AssignProcedures { line_id: String, procedure_ids: Vec<String> }, // BAS-113 — 1..N open procedures (billed amount each); empty = unassign; mutually exclusive with AssignGroups per line
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
    resolved_count: u32,        // whole-document totals, no consumer: the screen counts its visible lines;
    needs_correction_count: u32, // removal deferred to the next wire change (#359)
    recap: BankStatementRecap,   // the screen's recap — a view of the lines, no business rule
}

// The recap: a view of the draft's lines and the statement's period for the screen before validate (owner, 2026-11-15).
struct BankStatementRecap {
    lines_taken_count: u32,      // matched lines with ≥1 settlement item, auto-matched included (not left aside, not rejected)
    total_amount: i64,           // Σ the full credit amounts of those lines, remainders included
    partly_paid_lines: Vec<BankStatementPartlyPaidLine>, // those covered below their amount, document order
    period_start: Option<String>, // ISO date — the statement's period as parsed (BAS-020), when read
    period_end: Option<String>,
    period_month: Option<String>, // "YYYY-MM" when the period runs from a month's 1st to its last day; otherwise None and the screen shows the period
}

// A recap line whose items cover less than its amount (acknowledged remainder, BAS-092).
struct BankStatementPartlyPaidLine {
    line_id: String,
    credit_line: BankStatementCreditLine,
    fund_id: String,
    covered_amount: i64,
    remainder_amount: i64,       // credit amount − covered amount (BAS-092)
}

// One bank credit line within the reconciliation, in document order (BAS-060).
struct BankStatementLine {
    line_id: String,            // stable id for the line within this reconciliation session
    credit_line: BankStatementCreditLine,
    status: BankStatementLineStatus,    // BAS-061
    fund_id: Option<String>,    // resolved fund once linked; absent while needs-link
    assigned_group_ids: Vec<String>,  // BAS-090 — 0..N
    assigned_procedure_ids: Vec<String>, // BAS-113 — 0..N; exclusive with assigned_group_ids
    covered_amount: i64,        // BAS-091 — Σ assigned group amounts OR Σ assigned procedure billed amounts
    remainder_acknowledged: bool,     // BAS-092
    candidate_groups: Vec<BankStatementCandidate>, // BAS-068 — proposals for needs-group/partial, of the line's fund only (BAS-090A), most recent first
    candidate_procedures: Vec<BankStatementProcedureCandidate>, // BAS-112 — the linked fund's open procedures, oldest first; empty while needs-link
    suggested_fund_id: Option<String>,     // BAS-032 — heuristic, never the label's assignment (BAS-036)
    suggested_fund_name: Option<String>,
}

// BAS-061 — the per-line status set
enum BankStatementLineStatus {
    Matched,     // auto-matched, fully assigned (covered == line amount; groups OR procedures, BAS-061/113), or left aside (zero items + acknowledged remainder, BAS-123B)
    NeedsLink,   // label not yet linked to a fund
    NeedsGroup,  // fund known, no settlement item assigned, no acknowledged remainder (BAS-123B), ≥1 eligible candidate (group OR open procedure)
    Partial,     // some settlement items assigned, line not yet fully covered
    Rejected,    // label marked not-a-fund-payment (BAS-030)
    Unresolved,  // linked, zero items, no eligible candidate of either kind, not acknowledged
}

// BAS-068 — a ranked candidate group for an unresolved/partial line
struct BankStatementCandidate {
    group_id: String,
    fund_id: String,
    fund_name: String,          // resolved for display
    payment_date: String,
    total_amount: i64,
    is_exact_amount: bool,      // group total == line amount (the recomposition basis, BAS-068)
}

// BAS-112 — an open procedure of the line's linked fund, selectable when the
// fund never sends a PDF bordereau (bank-born group flow, BAS-115).
struct BankStatementProcedureCandidate {
    procedure_id: String,
    patient_name: String,       // resolved for display
    procedure_date: String,     // ISO date — list ordered oldest first
    billed_amount: i64,         // the only amount this flow knows (no per-procedure paid amounts)
    is_exact_amount: bool,      // billed == line amount (rare single-act credit)
}
```

## Events

| Event                     | Trigger                                                                                                                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProcedureUpdated`        | After `validate_bank_statement_reconciliation` — procedures move to `FundPaid` / `PartiallyFundPaid` (BAS-071)                                                                                                         |
| `BankEntryUpdated`        | After `validate_bank_statement_reconciliation` — new `BankEntry` records created, N per multi-group line (BAS-093)                                                                                                     |
| `FundPaymentGroupUpdated` | After `validate_bank_statement_reconciliation` — settled groups move to `BankPaid` and lock (BAS-072–073); also fires for a group **born** at validate (BAS-115 — a new record for cache listeners, not a status flip) |

## Changelog

- 2026-04-29 — Added by `bank-statement-auto-match` spec: parse_bank_statement, resolve_bank_account_from_iban, resolve_bank_fund_labels, save_bank_fund_label_mappings, match_bank_statement_lines, create_bank_transfers_from_statement, get_bank_statement_reconciliation_config
- 2026-04-29 — Deep review applied: added per-command intent and spec rule tracing, UL discrepancy note on create_bank_transfers_from_statement, GroupNotFound and InvalidDateFormat errors, ConfirmedMatch field origins, get_bank_statement_reconciliation_config frontend usage documented
- 2026-05-04 — Inline create flow (BAS-011..017): resolve_bank_account_from_iban description updated — `None` now drives the frontend inline create form rather than a dead-end. Rule reference R1 → BAS-010. No new commands; uses existing `create_bank_account` (see bank-contract.md).
- 2026-06-09 — Typed-error migration: per-command Errors columns now list the real wire-visible `BankStatementReconciliationError` variant codes (`BankError`/`FundError`/`BankStatementReconciliationTask`), replacing the pre-implementation aspirational names. `NoVirSepaLines` → `NoSepaCreditLines`.
- 2026-06-20 — Draft-UX rework (BAS-060–102): added `compute_bank_statement_reconciliation` and `validate_bank_statement_reconciliation`; superseded `resolve_bank_fund_labels`, `save_bank_fund_label_mappings`, `match_bank_statement_lines`, `create_bank_transfers_from_statement` (absorbed into the two new commands — collapse confirmed by user). Added reconciliation types (`BankStatementCorrection`, `BankStatementReconciliation`, `BankStatementLine`, `BankStatementLineStatus`, `BankStatementCandidate`), new error variants (`AssignmentOverflow`, `GroupNotEligible`, `GroupAlreadyConsumed`), and `FundPaymentGroupUpdated` event. Validate recomputes server-side from `corrections[]`; writes non-atomic (deferred UoW). `LinkFund` uses a typed `FundAssignment` (`Fund | Rejected`) instead of a `"REJECTED"` string sentinel; `AssignGroups` with an empty set means unassign / override an auto-match (BAS-062).
- 2026-07-30 — Post-v0.20.0 audit closure: added `fund_name` to `BankStatementCandidate` (shipped in v0.20.0, contract lagged); marked `get_bank_statement_reconciliation_config` SUPERSEDED (never implemented, no consumer since broadening moved server-side); BAS-090 amended — manual assignment may reference a cross-fund (broadened) group, the fund criterion binds auto-match only.
- 2026-08-03 — Two-screen flow + display window (BAS-116 rev, BAS-118–123): **comment-only refresh — no signature, type, or error change.** The single behavioral delta is engine status derivation: a zero-item acknowledged remainder now resolves the line (`Matched`, left aside, BAS-123B); `NeedsGroup` gains the "no acknowledged remainder" conjunct. Screen 1 (label association) and all BAS-118 window filtering are frontend-derived from the existing wire shape.
- 2026-07-31 — Bank-born groups (BAS-110–117): added `AssignProcedures` correction variant, `assigned_procedure_ids` + `candidate_procedures` on `BankStatementLine`, and `BankStatementProcedureCandidate`; new error codes `ProcedureNotEligible` (subsumes not-found) / `ProcedureAlreadyConsumed` on both live commands. `compute_bank_statement_reconciliation` additionally reads open procedures (BAS-112 predicate) + patient names for linked lines; `validate_bank_statement_reconciliation` births the `FundPaymentGroup` from assigned procedures (BAS-115 field mapping, stale-draft recheck) before settling it through the standard BAS-070–073 path. Group/procedure mutual exclusion per line resolved as a correction-list cascade (never an error); procedure consumption mirrors BAS-067. BAS-114 auto-select NOT RETAINED. `FundPaymentGroupUpdated` also fires for born groups (new record, not a status flip).
- 2026-09-29 — Label-mapping review (BAS-041–044): added `list_bank_label_mappings`, `reassign_bank_label_mapping`, `delete_bank_label_mapping`, the `BankFundLabelMapping` shared type, and the `LabelMappingNotFound` error code. No event: the review screen reloads after each change. BAS-046 (a deleted bank account deletes its labels) is a database trigger, not a command.
- 2026-11-02 — `delete_bank_label_mapping` really deletes the bank statement label; no signature change (#583).
- 2026-11-08 — `list_bank_label_mappings` and `compute_bank_statement_reconciliation` leave out a mapping whose fund is gone (#590, BAS-041D); no signature change.
- 2026-11-07 — `validate_bank_statement_reconciliation`: an unknown or deleted account is refused with `BankAccountNotFound` before anything is written (BAS-063A, #584); no signature change.
- 2026-11-08 — `validate_bank_statement_reconciliation`: a technical account is refused as unknown too (BAC-055A, #518); no signature change.
- 2026-11-14 — #643: the spec holds business rules only; the rule references follow (BAC-020 for the account created for an unknown IBAN, BAS-022, BAS-030–032, BAS-036, BAS-041A with #683, BAS-112–113, BAS-117; BAS-069 is vacant, its counters' removal is #359). No signature, type or error change.
- 2026-11-14 — #640: `validate_bank_statement_reconciliation` can answer `BankPaymentAlreadyConfirmed` (BSM-037), a defensive guard; a group already linked answers `DatabaseError` at its link (BSM-038). The born group is born `Active`, then settled, as BAS-115 says; `PaymentGroupNotFound` is listed.
- 2026-11-15 — #695 (the four steps, #692): `BankStatementLine.broadened_candidates` removed and `GroupNotEligible` refuses a group of another fund (BAS-068, BAS-090A — no cross-fund match); corrections replace in order, none refused for what it replaces (BAS-064A); a link to another fund, or a rejection, starts the label's lines again (BAS-066B), the same fund changes nothing (BAS-066C); `BankStatementReconciliation.recap` added (`BankStatementRecap`, `BankStatementPartlyPaidLine` — a view of the lines for the screen, no spec rule). BAS-065 (revert one correction) and BAS-062B are vacant.
- 2026-11-15 — #697: `BankStatementRecap` gains `period_start`, `period_end` and `period_month`, for the recap's month or period covered; no rule change.
- 2026-11-21 — #706: `compute_bank_statement_reconciliation` states BAS-066B (every correction dropped; its lines re-matched on a fund link only, every other free line either way, BAS-066A) and BAS-066C (a rejection repeated) as the spec does; BAS-062C retired, its number left vacant (BAS-066B holds it).
- 2026-11-21 — #644: `validate_bank_statement_reconciliation` cites BAS-053A to BAS-053C, the rules of a group settled since the draft; no signature change.
- 2026-11-22 — #720: `compute_bank_statement_reconciliation` says which lines a link re-matches: those with no settlement item and no hold (BAS-062A); no signature change.
- 2026-11-28 — #741: `compute_bank_statement_reconciliation`: a line the re-attempt matches drops a lone acknowledgment (BAS-066D); no signature change.
