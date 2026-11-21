# Business Rules — Automatic Bank Reconciliation via PDF Import (BAS)

## Context

A practitioner receives bank statements (PDF) issued by their bank, listing transfers received from health-insurance funds. This feature **automatically reconciles** these transfers with existing fund-payment groups, completing the procedure-payment lifecycle (Stage 2).

This document covers the **automatic flow** — PDF parsing, fund-label resolution, the matching algorithm, the reconciliation draft and its corrections, and the creation of bank transfers — and the **review of saved bank statement labels** outside that flow (BAS-041–046). The flow's corrections come in any order, each recomputing the draft (BAS-064); its recap is a view of the draft's lines, with no rule of its own (owner, 2026-11-15); the screens of the flow are described by their validated mocks (`docs/workflow.md` § Design).

## Entity Definition

**Bank statement label** (`BankFundLabelMapping` in code; ADR-009) — unique per bank account and label.

| Field        | Business meaning                                     |
| ------------ | ---------------------------------------------------- |
| bank account | The account whose statements carry the label         |
| label        | The label text of a bank statement line, as imported |
| assignment   | A fund, or rejected (BAS-030); stored as no fund     |

---

## Business Rules

### Bank-account identification (010–019)

**BAS-010 (R1) — Account resolution by IBAN (backend)**: The IBAN extracted from the statement identifies the bank account. When no account has it, the import is not refused: an account can be created for it as `bank-account.md` BAC-020 says, and the import goes on with it.

### Statement parsing (020–029)

**BAS-020 (R2) — Extracted data (backend)**: The parser extracts from the statement: the IBAN, the period covered, and the VIR SEPA credit lines.

**BAS-021 (R3) — VIR SEPA lines only (backend)**: Only SEPA transfers are processed. Other operations on the statement (refunds, non-SEPA transfers, fees, etc.) are ignored.

**BAS-022 (R4) — Unparsed lines (backend)**: The parse reports the number of VIR SEPA lines it could not read.

### Fund-label resolution (030–040)

**BAS-030 (R8) — Rejecting a label (backend)**: A label can be marked as rejected — it identifies a transfer that is not a fund payment. A rejected label is excluded from matching. Rejection is a valid assignment, on par with a fund.

**BAS-031 (R5) — Label → fund mapping (backend)**: Each transfer label (e.g. `CPAM93`) is mapped to a fund. If a saved assignment exists for this account and this label, the saved value (fund or rejected, see BAS-030) is the label's starting assignment.

**BAS-032 (R6) — Heuristic suggestion (backend)**: For a label without a known mapping, the system tries to identify a candidate fund in two stages, in this priority order:

1. **Prefixed extraction**: the system looks in the label for a digit sequence immediately preceded by the prefix `CPAM` or `CAISSE` (case-insensitive). If this sequence matches exactly the `fund_identifier` of a known fund, that fund is selected.
2. **Name match** (fallback): the label (uppercased) is compared with each known fund's name (uppercased, spaces removed). The match score is: length of the fund name if the label fully contains it, length of the label if the fund name fully contains it, or length of the common prefix otherwise. The fund with the best score is selected if that score is at least 3 characters.

The suggestion, if any, is informational: it is never the label's assignment (BAS-036).

**BAS-035 (R9) — Mapping persistence (backend)**: In the import flow, linking a label to a fund (or marking it rejected) persists the assignment on **validate** — never before. Each assignment (fund or rejected, see BAS-030) is saved under its `(bank account, label)` pair, replacing the one saved before. Saved values are the starting assignments of the next imports of the same account. An import whose flow is closed before validate persists nothing (BAS-064). (Validate is not transactionally atomic across all its writes — see Accepted limitations.)

**BAS-036 (R23) — An unknown label starts unassigned (backend)**: A label with no saved assignment starts with none: its suggestion (BAS-032) is never applied, and only an explicit link or rejection (BAS-066) assigns it.

**BAS-039 (R26) — No VIR SEPA lines (backend)**: If the statement contains no VIR SEPA line after filtering (see BAS-021), the import is refused with a specific error, distinct from an empty result, and goes no further.

### Bank statement label review (041–049)

A **bank statement label** is the label of a bank statement line, remembered per bank account with its assignment: a fund, or rejected (BAS-030). The import flow creates and updates them (BAS-031, BAS-035); these rules let the user review them outside that flow. Changes here are saved immediately — there is no validate step.

**BAS-041 — Review list (backend)**: The saved bank statement labels of every bank account can be listed, one entry each: its account, its label, and its assigned fund or rejected (BAS-030). No label is created from the list.

**BAS-041A — Default order (backend)**: The list is ordered by account name, then label.

**BAS-041D — Deleted fund (backend)**: A label whose fund has been deleted is left out of the list and of the import's known labels: the next import treats it as an unknown label (BAS-036), never as rejected (BAS-030). Reassigning or deleting it by its id works as for any label (BAS-042, BAS-043) (owner, 2026-11-08, #590).

**BAS-042 — Reassigning (backend)**: A label can be reassigned to another fund or to rejected (BAS-030). Its account and label cannot change. The change is saved immediately and is the starting assignment of the next import of that account (BAS-031); past reconciliations are unaffected. A deleted or unknown fund is refused and nothing is written.

**BAS-043 — Deleting (backend)**: A label is really deleted, whatever its past use, and unknown again: the next import of that account starts it unassigned (BAS-036), with a suggestion if one exists (BAS-032). Nothing cascades: bank transfers and groups reconciled while it existed are unaffected.

**BAS-044 — Label gone (backend)**: Reassigning or deleting a deleted or unknown label is refused with a specific error, and nothing is written.

**BAS-046 — Deleted bank account (backend)**: Deleting a bank account really deletes it and its bank statement labels. A deleted account's labels never come back, even when BAC-060 restores the account. Labels of accounts deleted before this rule existed are deleted once, on upgrade. A deleted account is gone: no IBAN resolves to it (BAS-010), and validating an import for it is refused (BAS-063A), so no import can add labels to it; the list therefore holds live accounts only.

### Matching algorithm (050–059)

**BAS-050 (R10) — Match criteria (backend)**: A fund-payment group is a candidate for a credit line if all three of the following conditions are met:

1. The group's fund matches the line's resolved fund
2. The group's total amount is strictly equal to the line's amount
3. The bank date is within the date tolerance (see BAS-051)

**BAS-051 (R11) — Date tolerance (backend)**: For **auto-match**, the bank line's date can be 0 to 15 days after the payment-group's date (delay between the fund's accounting date and the receipt of the transfer). **Manual** candidate search and assignment are NOT date-bounded — the human judging a correction may pick any unsettled group regardless of age; the amount/lock/consumption guards (BAS-053/067/094) still apply. _(2026-07-30 — was 7 days for both paths; real fund delays exceeded a week and older payments were invisible even to manual search.)_

**BAS-052 (R12) — Priority to oldest lines (backend)**: Lines are sorted by ascending date before matching. In case of conflict (multiple candidate lines for the same group), the oldest line is processed first.

**BAS-053 (R13) — Already-reconciled groups excluded (backend)**: A group already linked to a bank transfer is excluded from the matching pool.

**BAS-053A — A settled group is no longer auto-matched at validate (backend)**: Validate computes the draft again (BAS-064). A line auto-matched to a group that another bank entry settled since the draft is no longer matched to it: validate skips the line (BAS-063) unless the recompute matches it to another group.

**BAS-053B — A stale assignment refuses the validate (backend)**: When a correction assigns a group settled since the draft, or a procedure no longer open (BAS-112), the validate is rejected with a specific error and nothing is written.

**BAS-053C — A group settled during the validate (backend)**: A group that another bank entry settles while validate writes is not settled a second time (`bank-statement-manual-match` BSM-038): validate fails at that group with a specific error, and what it settled before stays (Accepted limitations).

**BAS-054 (R14) — Exclusive matching (backend)**: A group and a line can only be associated once. As soon as a match is established, both are locked for the rest of the processing.

### Reconciliation draft and corrections (060–069)

**BAS-060 (R15) — The draft's lines (backend)**: The reconciliation draft holds the statement's credit lines in **document order** (the order they appear on the statement), each with its fund once known, its amount and one status (BAS-061).

**BAS-061 — Per-line status (backend)**: The draft assigns each line exactly one status:

- **matched** — fully covered: auto-matched 1:1 to a group, assigned settlement items whose totals plus any acknowledged remainder equal the line amount exactly (BAS-091), **or left aside** — fund known, zero items, remainder acknowledged (BAS-123B). "Matched" denotes a decided line regardless of how it was reached.
- **needs-link** — its label is not yet linked to a fund.
- **needs-group** — fund known, zero settlement items assigned, no acknowledged remainder (BAS-123B), at least one eligible candidate exists (a candidate group, BAS-068, **or** an open-procedure candidate, BAS-112).
- **partial** — one or more settlement items assigned but the line is not yet fully covered (and no remainder acknowledged).
- **rejected** — its label is marked not-a-fund-payment (BAS-030).
- **unresolved** — linked to a fund, zero settlement items assigned, no eligible candidate of either kind, and not acknowledged.

A line counts as **resolved** when its status is **matched** or **rejected**. `needs-link`, `needs-group`, `partial`, and `unresolved` are not resolved. The distinction between `partial` and `unresolved` is precise: `partial` always has ≥1 assigned settlement item, `unresolved` always has zero. _(2026-07-31 — "settlement item" = an assigned group or an assigned open procedure; a line carries items of at most one kind, BAS-113.)_

**BAS-062 — Correcting a line (backend)**: A line linked to a fund can be assigned one or more groups (BAS-090) or procedures (BAS-113), or its remainder acknowledged (BAS-092), within BAS-064's refusals; its label is linked or rejected through BAS-066. A line already matched or assigned can be **overridden** — reassigned to a different group, or unassigned. An explicit group-assignment correction on a line (including assigning an empty set to unassign) takes precedence over the line's auto-match for the rest of the recompute (BAS-062A). The override goes through the same corrections and cascade (BAS-066–067).

**BAS-062A — An assignment correction holds the line (backend)**: While an assignment correction, even an empty one, applies to a line, no link brings the auto-match back on it: neither a link of another label nor a link of its own label to the fund it already has (BAS-066C). A left-aside line stays left aside. The hold ends when the line's own label is linked to another fund or marked rejected (BAS-066B).

**BAS-063 (R18) — Validate is skip-based (backend)**: Validate never refuses undecided lines: only resolved lines produce transfers (BAS-070); unresolved/needs-\* lines are simply skipped. A rejected line produces no transfer by design.

**BAS-063A — Validating for an unknown account (backend)**: Validating an import for an unknown bank account, a deleted one included, is rejected with a specific error, and no bank entry or label is saved.

**BAS-064 — Draft computed by recompute (backend)**: The reconciliation draft (the full line list with per-line status and candidate proposals) is a pure function of the parsed statement plus the ordered list of applied corrections. The draft is **ephemeral** — no draft state is persisted; closing the flow discards it. Each correction triggers a recompute that replays all corrections in order and answers the complete recomputed draft synchronously. A correction that cannot be honored is rejected with a specific error and the draft is unchanged: a correction on an unknown line; a link to an unknown fund; a non-empty assignment on a line not linked to a fund (unlinked or rejected); an unknown group, one of another fund (BAS-090A), or one already settled (BAS-053, BAS-090) or already consumed by another line (BAS-067); an assignment that would overflow the line amount (BAS-094).

**BAS-064A — Corrections replace, in order (backend)**: The draft replays the corrections in the order they were made. An assignment of groups or procedures replaces the line's earlier assignment of either kind and its acknowledged remainder (BAS-113, BAS-092); an acknowledgment adds to the line's current assignment; a link that changes its label's assignment replaces what its lines had (BAS-066B), and one that does not drops nothing (BAS-066C). A replaced correction never comes back, and no correction is refused for what it replaces.

**BAS-066 — Link-fund correction and cascade (backend)**: A link that changes a label's assignment — to a fund, or marking it rejected (BAS-030) — decides the status of **all** lines sharing that label in one action (BAS-066B). On a link to a fund, lines that match an eligible group (BAS-050–054) auto-resolve to **matched** and the rest are flagged **needs-group** or **unresolved**; on a rejection, they are **rejected** (BAS-061).

**BAS-066A — Every link re-attempts the auto-match (backend)**: After a link or a rejection, the auto-match (BAS-050–054) is re-attempted on every line, whatever its label, that has no settlement item and no hold (BAS-062A). An existing auto-match is kept, but on the lines BAS-066B starts again.

**BAS-066B — A changed link starts its lines again (backend)**: Linking a label to another fund than the one it has — a label that had none or was rejected included — or marking it rejected starts its lines again (owner, 2026-11-15, #692): their auto-match and every correction made on them before — an assignment of groups or procedures, an empty one included, an acknowledged remainder — are dropped, and their groups and procedures return to their pools. On a link to a fund, the auto-match is then re-attempted under that fund; a rejected line is never matched (BAS-030). Such a link is never refused for what it drops. The lines of the other labels keep what they have.

**BAS-066C — Linking to the same assignment drops nothing (backend)**: Linking a label to the fund it already has, or marking a rejected label rejected again, keeps what its lines have — no settlement item or correction is dropped. BAS-066A's re-attempt still runs, the label's own lines with no settlement item and no hold included when it is linked to a fund (owner, 2026-11-21, #632).

**BAS-067 — Group consumption (backend)**: Assigning a group to a line removes that group from every other line's candidate proposals (a group settles at most one line; BAS-054). Replacing or emptying the assignment, or dropping it (BAS-066B), returns the group to the candidate pool.

**BAS-068 — Candidate proposals (backend)**: For a line needing a group, the draft offers candidate groups ordered **most recent payment date first**, filtered to the line's fund but **not date-bounded** (BAS-051 manual path); an exact-amount candidate is flagged. No group of another fund is proposed (BAS-090A). For a line that already has assigned groups, the candidate lists include those groups, and the amount filter applies against the **full line amount**: an assign-group correction recomposes (replaces) the assignment (BAS-062), with the overflow guard (BAS-094) bounding the total. _(Replaces former BAS-062.)_

### Transfer creation and status updates (070–079)

**BAS-070 (R19) — Bank transfer creation (backend)**: For each validated match, a bank transfer is created and linked to the corresponding fund-payment group. Validate publishes `BankEntryUpdated`, `ProcedureUpdated` and `FundPaymentGroupUpdated` for what it changed (BAS-071–073, BAS-115).

**BAS-071 (R20) — Procedure status updates (backend)**: All procedures in the group move to their final status:

- `Reconciled` → `FundPaid` (`actual_payment_amount` = procedure amount)
- `PartiallyReconciled` → `PartiallyFundPaid` (`actual_payment_amount` preserved)

**BAS-072 (R21) — Group locking (backend)**: As soon as a group is reconciled at the bank level, it becomes locked — it can no longer be edited or deleted from the fund-reconciliation flow.

**BAS-073 (R22) — Group status update (backend)**: When the bank transfer is created, the associated fund-payment group moves to `BankPaid` status.

**Affected fields — on transfer creation**

| Entity    | Field                    | Value                                                                   |
| --------- | ------------------------ | ----------------------------------------------------------------------- |
| Procedure | `payment_status`         | `Reconciled` → `FundPaid` / `PartiallyReconciled` → `PartiallyFundPaid` |
| Procedure | `payment_method`         | `BankTransfer`                                                          |
| Procedure | `confirmed_payment_date` | = bank transfer date                                                    |
| Procedure | `actual_payment_amount`  | preserved                                                               |
| Group     | `status`                 | `Active` → `BankPaid`                                                   |
| Group     | `is_locked`              | → true                                                                  |

### Composite credit corrections (090–099)

> A real bank credit can be a composite the original 1:1 exact-amount match (BAS-050) cannot settle: one credit equal to the sum of several groups, and/or a credit that includes a portion the application does not model (e.g. an "aide"/bonus transfer). These rules cover both. (Resolves issue #62.)

**BAS-090 — Multi-group assignment (backend)**: A line can be assigned to one **or several** groups of its own fund (BAS-090A), each not already reconciled (BAS-053). Two relaxations relative to auto-match: exact-amount equality (BAS-050 condition 2) is relaxed — a group qualifies if its amount is at most the line amount, the assigned total bounded by BAS-094 — and the date tolerance (BAS-051) binds **auto-match only**: a manual assignment can reference a group of any age (a slow-paying fund).

**BAS-090A — A group of another fund is refused (backend)**: Assigning a line a group of another fund than the line's is rejected with a specific error, and the draft is unchanged (owner, 2026-11-15, #692): a wrong label is linked again instead (BAS-066B).

**BAS-091 — Line balance (backend)**: The draft tracks, per line, the running balance `Σ(assigned settlement-item amounts) + acknowledged remainder` against the line amount — group totals when groups are assigned, procedure billed amounts when procedures are (BAS-113). A multi-item line is fully covered — and therefore status **matched** (BAS-061) — only when that sum equals the line amount exactly. While the sum is below the line amount it is **partial**. The acknowledged remainder is **never folded into the covered amount** — it is told apart, so a left-aside line (BAS-123B) can be told from a covered one.

**BAS-092 — Remainder acknowledgment (backend)**: When the assigned settlement items sum to **less** than the line amount — including **zero** items — the difference can be acknowledged as an untracked remainder (a credit portion the application does not model). Acknowledging it marks the line resolved (BAS-123B for the zero-item form, which leaves the line aside). The remainder is **informational only** — it creates no bank transfer, no persisted record, and exists only within the ephemeral draft.

**BAS-093 — Multi-group transfer creation (backend)**: On validate, a line assigned to N groups creates **N bank transfers**, one per group, each sized to its group's total amount (consistent with BAS-070). An acknowledged remainder (BAS-092) contributes no transfer. _(Deliberate asymmetry with the manual flow: BSM models one `FUND` transfer spanning several groups, whereas the auto flow creates one transfer per group from a single credit line. Both write the same `BankEntry` aggregate and lock the groups; the shapes differ by design.)_

**BAS-094 — Overflow guard (backend)**: The assigned settlement items' total never exceeds the line amount. An assignment that would overflow is rejected with a specific error.

### Bank-born groups (110–119)

> Some funds (e.g. RATP) never send a PDF bordereau, so no fund-payment group
> ever exists for their credits and the line dead-ends as unresolved. Resolution
> (field report 2026-07-31): settle such credits by selecting the fund's open
> procedures directly — the missing fund-payment group is **born at validate**
> and then settled through the standard path.

**BAS-112 — Open-procedure candidates (backend)**: For a linked line, the draft offers the fund's **open procedures**. A procedure is _open_ exactly when ALL hold: its fund is the line's fund; its `payment_status` is `Created`; it belongs to no fund-payment-group line; and it has a positive billed amount (`billed_amount` > 0 — excludes zero-amount procedures and negative `OverpaymentRefund` mirrors by construction, which carry other statuses anyway). Candidates are ordered **oldest procedure date first**, ties broken by procedure id (stable). Each candidate carries the procedure date, the patient's display name, the billed amount (the only amount this flow knows), and an exact-amount flag (billed == line amount). Not date-bounded, mirroring the manual group search (BAS-051).

**BAS-113 — Assigning procedures (backend)**: A correction assigns 1..N open procedures to a line; an empty set is a valid unassign (BAS-062 override semantics, including precedence over the line's auto-match). Balance, overflow guard, and remainder acknowledgment reuse the group semantics verbatim (BAS-091/092/094), each procedure counted at its billed amount. Group- and procedure-assignment are **mutually exclusive per line**: a correction that assigns procedures **replaces** the line's earlier groups, an auto-matched one included (and vice versa), and a replaced correction never comes back (BAS-064A). Either assignment kind also replaces a remainder acknowledged on the line before it (BAS-092 — its implied size changed). A procedure assigned to one line is consumed for every other line's proposals (mirror of BAS-067); replacing, emptying or dropping the assignment returns it. A correction referencing a procedure that is unknown, not open, or not of the line's fund is rejected and the draft is unchanged (BAS-064); procedures never cross funds. One already consumed by another line is likewise rejected with its own distinct error.

**BAS-115 — Group born at validate (backend)**: On validate, a line resolved via procedures creates a fund-payment group and settles it in the same pass. Field mapping, an explicit exception to the two-stage fund lifecycle (FPM-010 / BSM R1 — the fund never issued a bordereau, so stage 1 is folded into validate):

| Entity     | Field                                       | Value                                                                                                                 |
| ---------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Group      | `fund_id`                                   | the line's fund                                                                                                       |
| Group      | `payment_date`                              | the bank line date                                                                                                    |
| Group      | `total_amount`                              | Σ billed amounts (= Σ `actual_payment_amount`, preserving FPM-210)                                                    |
| Group      | `status` / `is_locked`                      | born `Active`, then `BankPaid` + locked via the standard settle step (BAS-072–073), never locked without its transfer |
| Group line | one per procedure                           | —                                                                                                                     |
| Procedure  | `payment_status`                            | `Created` → `FundPaid` (single step)                                                                                  |
| Procedure  | `actual_payment_amount`                     | = billed amount                                                                                                       |
| Procedure  | `fund_reconciliation_date`                  | = bank line date                                                                                                      |
| Procedure  | `payment_method` / `confirmed_payment_date` | `BankTransfer` / bank line date (as BAS-070–073)                                                                      |

One bank transfer is created and linked as for any group (BAS-070/093). A failed validate never leaves a locked group without its transfer: a group born without its transfer stays `Active` and can be deleted through the fund flows. Precedent: REF-100 (overpayment) already births a fund-payment group outside the fund-PDF flow — this rule follows it. Nothing is persisted before validate (ephemeral draft, BAS-064); an import whose flow is closed before validate leaves no trace. A failure during group creation or settling aborts the validate with a specific error — never a silent success count (see Accepted limitations for the widened non-atomic window). **After validate the born group is an ordinary group**: deleting its bank transfer later (BSM R8) reverts it like any other (procedures → `Reconciled`, group `Active`, editable through the fund flows) — accepted, since by then the payment reality it records did happen.

**BAS-117 — The procedure path knows billed amounts only (backend)**: A procedure settled from a bank line counts at its billed amount (BAS-113): no other amount and no dispute; no patient or procedure is created, and no procedure's date, amount or patient changes — only its payment fields move (BAS-071, BAS-115). Those other changes belong to the fund-PDF reconciliation flow. Consequently a credit smaller than every single open procedure's billed amount cannot be settled through this path (nothing fits under the overflow guard) — such a line is left aside instead (BAS-123B).

### Leaving a line aside (120–129)

**BAS-123B — Zero-item acknowledgment resolves (backend)**: A line with a known fund, **zero** assigned settlement items, and an acknowledged remainder is **matched** even when candidates exist. A line is **left aside** by an empty assignment followed by the acknowledgment of its whole amount: the empty assignment holds it (BAS-062A), so no later link brings an auto-match back unless it links the line's own label to another fund (BAS-066B); an acknowledgment alone holds nothing (BAS-066A). Defensive invariant: an acknowledgment never resolves a line whose label is unlinked.

---

## Workflow

```
[Parse statement] (BAS-020–022, BAS-039)
  → IBAN, period, VIR SEPA lines
          │
          ▼
[Resolve bank account] (BAS-010)
  → by IBAN; unknown → an account can be created for it (BAC-020)
          │
          ▼
[Build draft] (BAS-064)
  → saved assignments as starting point (BAS-031), suggestions (BAS-032)
  → auto-match (fund + amount + date tolerance, BAS-050–054)
  → every line with its status (BAS-061)
          │
          ▼
[Corrections, in any order] — each recomputes the draft (BAS-064)
  → link a label to a fund or reject it (BAS-066–066C); a changed link starts its
    lines again (BAS-066B)
  → assign groups of the line's fund (BAS-090) or procedures (BAS-113)
  → acknowledge a remainder / leave a line aside (BAS-092, BAS-123B)
          │
          ▼
[Validate] (BAS-063) — or close: nothing persisted
  → persist label assignments (BAS-035)
  → birth bank-born groups from assigned procedures (BAS-115)
  → create bank transfers (N per multi-group line, BAS-093)
  → procedures → FundPaid / PartiallyFundPaid (or Created → FundPaid, BAS-115); groups locked → BankPaid
  → unresolved lines skipped; acknowledged remainders create nothing
```

---

## Accepted limitations

- **Non-atomic validate (deferred UoW)**: validate saves the labels, births the groups of the lines settled by procedures, then for each group creates its transfer and link and settles it with its procedures in one unit of work (ADR-003); the groups are not one transaction. A failure mid-validate leaves the groups before it committed, part of a multi-group line included; a bank-born group created before its transfer stays `Active` with no transfer (visible in the fund flows, repairable there), and the transfers already committed publish no `BankEntryUpdated` or `ProcedureUpdated` (BAS-070). Accepted for now — single-user desktop makes the window practically unobservable, and failures are loud, never silent (see `docs/techdebt.md` 2026-05-19 "Non-atomic bank-reconciliation writes" and ADR-003). To be revisited when UoW infrastructure lands.
- **Unbilled procedures are not settleable from the bank flow**: BAS-112 requires a positive billed amount, so a procedure whose amount was never entered cannot be selected — enter its amount (or use the fund-PDF flow) first. Accepted.
- **Remainder is not recorded**: an acknowledged remainder (BAS-092) — including a left-aside line (BAS-123B) — leaves no trace after the flow closes; it is a session-only acknowledgment, not an audit record. Label-level rejections DO persist (BAS-035); line-level leave-asides do not. A persisted "dismissed credit" concept is intentionally out of scope (deferred).

## Open questions

- [ ] BAS-032's whitespace handling and tie suppression, in the code, not in this spec — #551.
- [ ] At validate, may a line whose auto-matched group was settled since the draft be matched to another eligible group (BAS-053A)? Today the recompute decides, as for any line.
- [ ] What does validate answer for an assigned group deleted, or changed in amount, since the draft (BAS-053B)? Today the recompute's own refusals apply (BAS-064, BAS-094).
- [ ] A remainder acknowledged on a line not covered below its amount is not refused (BAS-092) — #358.
