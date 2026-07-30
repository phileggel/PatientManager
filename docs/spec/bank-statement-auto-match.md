# Business Rules — Automatic Bank Reconciliation via PDF Import (BAS)

## Context

A practitioner receives bank statements (PDF) issued by their bank, listing transfers received from health-insurance funds. This feature **automatically reconciles** these transfers with existing fund-payment groups, completing the procedure-payment lifecycle (Stage 2).

This document covers exclusively the **automatic flow**: PDF parsing, fund-label resolution, mandatory user review of mappings, matching algorithm, user review, and creation of bank transfers.

---

## Business Rules

### Bank-account identification (010–019)

**BAS-010 (R1) — Account resolution by IBAN (backend)**: The IBAN extracted from the PDF is used to identify the bank account. If no account matches, the workflow does not stop — the user is offered an inline create flow (see BAS-011).

**BAS-011 — Inline account creation when IBAN not found (frontend)**: When the IBAN extracted from the statement does not match any existing account, the workflow presents an inline create form within the import modal instead of a dead-end message.

**BAS-012 — Inline create form fields (frontend)**: The inline create form contains two fields:

- **IBAN** — pre-filled with the IBAN extracted from the statement, read-only.
- **Name** — empty, required, must be non-empty after trimming whitespace.

**BAS-013 — Inline create — backend submission (backend)**: On submit, the system attempts to create a bank account with the supplied name and the pre-filled IBAN. The result is either the created bank account (success) or a backend error message (failure). IBAN uniqueness across all accounts (including soft-deleted) is enforced by the bank-account aggregate (see `bank-account.md` R5).

**BAS-014 — Inline create — workflow continuation on success (frontend)**: On successful creation, the import workflow uses the newly created account as the resolved bank account and proceeds directly to fund-label resolution. The user is not required to re-import the PDF.

**BAS-015 — Inline create — submission loading state (frontend)**: While the create call is in progress, the form fields are disabled and the Submit button reflects a loading state. The user cannot resubmit during this period.

**BAS-016 — Inline create — backend error feedback (frontend)**: On any backend error during creation (typical causes include a duplicate IBAN against an existing or soft-deleted account, name validation failure, or persistence failure), the backend error message is displayed inline below the form. The form stays open with the user's input preserved so the input can be corrected or cancelled.

**BAS-017 — Inline create — cancellation (frontend)**: Cancelling the inline create form closes the import modal entirely and abandons the import. The Cancel button and any other modal-close affordance produce the same effect — there is no fallback dead-end screen.

### Statement parsing (020–029)

**BAS-020 (R2) — Extracted data (backend)**: The parser extracts from the statement: the IBAN, the period covered, and the VIR SEPA credit lines.

**BAS-021 (R3) — VIR SEPA lines only (backend)**: Only SEPA transfers are processed. Other operations on the statement (refunds, non-SEPA transfers, fees, etc.) are ignored.

**BAS-022 (R4) — Unparsed lines (backend + frontend)**: The number of lines not recognized by the parser is shown as a warning.

### Fund-label resolution (030–049)

**BAS-030 (R8) — Rejecting a label (frontend + backend)**: A label can be marked as rejected — it identifies a transfer that is not a fund payment. A rejected label is excluded from matching. Rejection is a valid assignment, on par with a fund.

**BAS-031 (R5) — Label → fund mapping (backend)**: Each transfer label (e.g. `CPAM93`) is mapped to a fund. If an existing mapping is found for this account and this label, the saved value (fund or rejected, see BAS-030) is passed to the frontend for pre-fill.

**BAS-032 (R6) — Heuristic suggestion (backend)**: For a label without a known mapping, the system tries to identify a candidate fund in two stages, in this priority order:

1. **Prefixed extraction**: the system looks in the label for a digit sequence immediately preceded by the prefix `CPAM` or `CAISSE` (case-insensitive). If this sequence matches exactly the `fund_identifier` of a known fund, that fund is selected.
2. **Name match** (fallback): the label (uppercased) is compared with each known fund's name (uppercased, spaces removed). The match score is: length of the fund name if the label fully contains it, length of the label if the fund name fully contains it, or length of the common prefix otherwise. The fund with the best score is selected if that score is at least 3 characters.

The suggestion, if any, is sent to the frontend as informational (see BAS-033).

**BAS-033 (R28) — Display of the heuristic suggestion (frontend)**: When a suggestion exists for an unknown label (see BAS-032), it is displayed as helper text below the selection field. It is never pre-selected in the field. If no suggestion exists for an unknown label, nothing is displayed below the field.

**BAS-034 (R7) — Mapping step always required (frontend)** — **SUPERSEDED by BAS-066.** The standalone mapping step is removed; label → fund linking is now a per-line `link-fund` correction inside the unified reconciliation list. _(Original: the mapping step was always shown for the full set of labels before matching.)_

**BAS-035 (R9) — Mapping persistence (frontend + backend)**: Linking a label to a fund (or marking it rejected) persists the assignment on **validate** — never before. The backend saves each assignment (fund or rejected, see BAS-030) via an upsert, the unique key being the combination `(bank account, label)`. Saved values serve as pre-fill for the next imports of the same account. A correction reverted before validate (BAS-065) is never persisted. (Validate is not transactionally atomic across all its writes — see Accepted limitations.)

**BAS-036 (R23) — Empty field for unknown label (frontend)**: For a label with no saved mapping, the selection field is shown empty — no default value or suggestion is pre-selected. The user must make an explicit choice (fund or reject).

**BAS-037 (R24) — "Accept" button — fixed position (frontend)** — **SUPERSEDED by BAS-063.** No standalone mapping step exists; validate is governed by the unified list (unresolved lines are non-blocking).

**BAS-038 (R25) — "Accept" button — activation condition (frontend)** — **SUPERSEDED by BAS-063.** Validate is never blocked by unlinked labels; lines whose label is still unlinked simply remain unresolved and produce no transfer.

**BAS-039 (R26) — No VIR SEPA lines (backend + frontend)**: If the statement contains no VIR SEPA line after filtering (see BAS-021), the backend returns a structured error distinct from an empty result. The frontend displays an explicit error message and stops the workflow — no further step is reachable.

**BAS-040 (R27) — Display order of labels in the mapping step (frontend)** — **SUPERSEDED by BAS-060.** Lines are no longer grouped by mapping status; they render in document order within the unified list (BAS-060). _(Original: labels were shown in two alphabetical blocks, unknown then known.)_

### Matching algorithm (050–059)

**BAS-050 (R10) — Match criteria (backend)**: A fund-payment group is a candidate for a credit line if all three of the following conditions are met:

1. The group's fund matches the line's resolved fund
2. The group's total amount is strictly equal to the line's amount
3. The bank date is within the date tolerance (see BAS-051)

**BAS-051 (R11) — Date tolerance (backend)**: The bank line's date can be 0 to 7 days after the payment-group's date (typical delay between the fund's accounting date and the receipt of the transfer).

**BAS-052 (R12) — Priority to oldest lines (backend)**: Lines are sorted by ascending date before matching. In case of conflict (multiple candidate lines for the same group), the oldest line is processed first.

**BAS-053 (R13) — Already-reconciled groups excluded (backend)**: A group already linked to a bank transfer is excluded from the matching pool.

**BAS-054 (R14) — Exclusive matching (backend)**: A group and a line can only be associated once. As soon as a match is established, both are locked for the rest of the processing.

### Unified reconciliation list and draft model (060–069)

> This block reworks the post-matching review into a single whole-document list backed by an ephemeral backend draft. It overrides the exception-first ordering of `docs/reconciliation-ux-pattern.md` (lines render in document order) and resolves that doc's batch-semantics open question to a guided walkthrough (BAS-100–102).

**BAS-060 (R15) — Unified reconciliation list (frontend)**: After parsing and account resolution, every credit line of the statement is shown in a single list, in **document order** (the order the lines appear on the statement). Each line shows its identity (`fund · value`) and a **status** (BAS-061). The list replaces the former separate mapping and review steps.

**BAS-061 — Per-line status (frontend + backend)**: The backend draft assigns each line exactly one status:

- **matched** — fully covered: either auto-matched 1:1 to a group, or assigned one or more groups whose totals plus any acknowledged remainder equal the line amount exactly (BAS-091). "Matched" denotes full coverage regardless of how it was reached (1:1 or multi-group).
- **needs-link** — its label is not yet linked to a fund.
- **needs-group** — fund known, zero groups assigned, at least one eligible candidate group exists.
- **partial** — one or more groups assigned but the line is not yet fully covered (and no remainder acknowledged).
- **rejected** — its label is marked not-a-fund-payment (BAS-030).
- **unresolved** — linked to a fund but zero groups assigned, no eligible candidate group, and not acknowledged.

A line counts as **resolved** when its status is **matched** or **rejected**. `needs-link`, `needs-group`, `partial`, and `unresolved` are not resolved. The distinction between `partial` and `unresolved` is precise: `partial` always has ≥1 assigned group, `unresolved` always has zero.

**BAS-062 — Per-line correction entry (frontend + backend)**: Double-clicking any line opens a correction modal scoped to that single line, offering the corrections valid for its current state (link-fund, assign-group(s), remainder acknowledgment). A line that is already matched or assigned can also be opened to **override** it — reassign to a different group, or unassign it. An explicit group-assignment correction on a line (including assigning an empty set to unassign) takes precedence over the line's auto-match for the rest of the recompute; reverting that correction (BAS-065) restores the auto-match. This preserves the former manual-override capability within the pure-recompute model (BAS-064). The override flows through the same correction commands and cascade (BAS-066–067).

**BAS-063 (R18) — Unresolved lines non-blocking (frontend + backend)**: Validation is never blocked by lines still needing correction. Only resolved lines produce transfers (BAS-070); unresolved/needs-\* lines are simply skipped. A rejected line produces no transfer by design.

**BAS-064 — Draft computed by backend recompute (frontend + backend)**: The reconciliation draft (the full line list with per-line status and candidate proposals) is computed by the backend as a pure function of the parsed statement plus the ordered list of applied corrections. The draft is **ephemeral** — no draft state is persisted; closing the flow discards it. Each correction triggers a recompute that replays all corrections in order and returns the complete recomputed draft synchronously as the single observable result. While a recompute is in flight the frontend shows a busy state on the list; if a recompute fails, the error is surfaced and the previously displayed draft is left intact (the failing correction is not applied). A correction that cannot be honored is rejected and the draft is unchanged: assigning a group not eligible for the line (fund / date / already settled, BAS-050–054, BAS-090), assigning a group already consumed by another line (BAS-067), or an assignment that would overflow the line amount (BAS-094) are each rejected with a specific error; the frontend signals it and keeps the prior draft.

**BAS-065 — Revert a correction (frontend + backend)**: Any applied correction can be reverted. Reverting removes it from the correction list and recomputes the draft, undoing its cascade (e.g. a group it consumed becomes available again, lines it resolved revert to their prior status). Nothing reverted before validate is persisted.

**BAS-066 — Link-fund correction and cascade (frontend + backend)**: Linking a label to a fund — or marking it rejected (BAS-030) — resolves **all** lines sharing that label in one action. Lines that, once their fund is known, match an eligible group (BAS-050–054) auto-resolve to **matched**; the rest are re-flagged **needs-group** or **unresolved**. The heuristic suggestion (BAS-032) and empty-field-for-unknown rule (BAS-036) apply within the link-fund modal.

**BAS-067 — Group consumption (backend)**: Assigning a group to a line removes that group from every other line's candidate proposals (a group settles at most one line; BAS-054). Reverting the assignment (BAS-065) restores the group to the candidate pool.

**BAS-068 — Candidate proposals and broadened search (frontend)**: For a line needing a group, the draft offers candidate groups ranked by match quality (exact amount first, then date proximity), filtered to the line's fund and date tolerance (BAS-051). A "broaden" affordance shows all candidate groups beyond the fund filter while keeping date tolerance; a broadened candidate is selectable and assignable (manual cross-fund override, BAS-090). _(Replaces former BAS-062.)_

**BAS-069 — Summary and filter (frontend)**: The list shows a running count of resolved vs needs-correction lines and offers a filter to hide resolved lines. Filtering never changes the underlying document order (BAS-060).

### Transfer creation and status updates (070–079)

**BAS-070 (R19) — Bank transfer creation (backend)**: For each validated match, a bank transfer is created and linked to the corresponding fund-payment group.

**BAS-071 (R20) — Procedure status updates (backend)**: All procedures in the group move to their final status:

- `Reconciliated` → `FundPayed` (`actual_payment_amount` = procedure amount)
- `PartiallyReconciled` → `PartiallyFundPayed` (`actual_payment_amount` preserved)

**BAS-072 (R21) — Group locking (backend)**: As soon as a group is reconciled at the bank level, it becomes locked — it can no longer be edited or deleted from the fund-reconciliation flow.

**BAS-073 (R22) — Group status update (backend)**: When the bank transfer is created, the associated fund-payment group moves to `BankPayed` status.

### Last-folder memory (080–089)

**BAS-080 — Last-folder memory (frontend)**: When the user successfully picks a bank-statement PDF from the OS file dialog, the parent folder of the picked file is persisted in `localStorage` under the per-feature key `import-last-folder:bank-pdf`. On the next bank-statement import, that folder is passed to the dialog as `defaultPath`. Excel and fund-PDF imports use independent slots (`import-last-folder:excel` / `import-last-folder:fund-pdf`) and do not share this default. Cancelling the dialog leaves the persisted folder untouched. If the persisted folder is no longer reachable, the native dialog opens at the OS's own fallback (home or last-used location depending on platform); no explicit fallback resolution happens in the app.

**Affected fields — on transfer creation**

| Entity    | Field                    | Value                                                                        |
| --------- | ------------------------ | ---------------------------------------------------------------------------- |
| Procedure | `payment_status`         | `Reconciliated` → `FundPayed` / `PartiallyReconciled` → `PartiallyFundPayed` |
| Procedure | `payment_method`         | `BankTransfer`                                                               |
| Procedure | `confirmed_payment_date` | = bank transfer date                                                         |
| Procedure | `actual_payment_amount`  | preserved                                                                    |
| Group     | `status`                 | `Active` → `BankPayed`                                                       |
| Group     | `is_locked`              | → true                                                                       |

### Composite credit corrections (090–099)

> A real bank credit can be a composite the original 1:1 exact-amount match (BAS-050) cannot settle: one credit equal to the sum of several groups, and/or a credit that includes a portion the application does not model (e.g. an "aide"/bonus transfer). These rules cover both. (Resolves issue #62.)

**BAS-090 — Multi-group assignment (frontend + backend)**: A line can be assigned to one **or several** groups. Each assigned group must be eligible for the line under the existing match criteria (BAS-051 date tolerance, BAS-053 not already reconciled), with two relaxations relative to auto-match: exact-amount equality (BAS-050 condition 2) is relaxed — a group qualifies if its amount is less than or equal to the line's outstanding (yet-uncovered) amount — and the fund criterion (BAS-050 condition 1) binds **auto-match only**. An explicit manual assignment may reference a group from another fund (the broadened view, BAS-068): the user selecting a broadened candidate is the human override for an imperfect label mapping. _(2026-07-30 — previously the backend rejected cross-fund manual assignment with `GroupNotEligible`, making every broadened selection fail on submit; resolved in favor of allowing the override.)_

**BAS-091 — Line balance (backend)**: The draft tracks, per line, the running balance `Σ(assigned group amounts) + acknowledged remainder` against the line amount. A multi-group line is fully covered — and therefore status **matched** (BAS-061) — only when that sum equals the line amount exactly. While the sum is below the line amount it is **partial**.

**BAS-092 — Remainder acknowledgment (frontend + backend)**: When the assigned groups sum to **less** than the line amount, the user may acknowledge the difference as an untracked remainder (a credit portion the application does not model). Acknowledging it marks the line resolved. The remainder is **informational only** — it creates no bank transfer, no persisted record, and exists only within the ephemeral draft.

**BAS-093 — Multi-group transfer creation (backend)**: On validate, a line assigned to N groups creates **N bank transfers**, one per group, each sized to its group's total amount (consistent with BAS-070). An acknowledged remainder (BAS-092) contributes no transfer. _(Deliberate asymmetry with the manual flow: BSM models one `FUND` transfer spanning several groups, whereas the auto flow creates one transfer per group from a single credit line. Both write the same `BankEntry` aggregate and lock the groups; the shapes differ by design.)_

**BAS-094 — Overflow guard (frontend + backend)**: The assigned groups' total may never exceed the line amount. An assignment that would overflow is rejected; the correction modal prevents it and signals the would-be overflow.

### Guided correction wizard (100–109)

**BAS-100 — Wizard entry (frontend)**: A wizard button is shown at the top of the unified list. It launches a guided walkthrough that steps through the lines needing correction one at a time, instead of the user hunting for them.

**BAS-101 — Phased walkthrough order (frontend)**: The wizard resolves corrections in two phases: first every **link-fund** correction (all unlinked labels), then every **assign-group** correction. Within a phase, items are presented in document order (BAS-060). Each step presents the same selection UI as the equivalent manual correction: the link-fund step requires an explicit fund choice or an explicit reject (BAS-030/036 — an empty selection never implies rejection); the assign-group step presents the ranked candidate selector with balance, broaden, and overflow guard (BAS-068, BAS-090–094). A step can be **skipped** without applying any correction — the line keeps its status and remains non-blocking (BAS-063); skipping never submits an empty assignment (which would be an unassign override, BAS-062).

**BAS-102 — Wizard shares the correction model (frontend + backend)**: Each wizard step applies the same typed correction command as the equivalent manual per-line correction (BAS-062), triggering the same draft recompute and cascade (BAS-064, BAS-066, BAS-067). A correction made via the wizard is revertable identically (BAS-065); there is one correction model, not two.

**BAS-103 — Wizard completion and abandonment (frontend)**: Reaching the end of the wizard (both phases done, or no more correction-needed items) returns the user to the unified list with all applied corrections reflected. The wizard can be abandoned at any step; abandoning returns to the list and **keeps** every correction already applied (they live in the same draft, BAS-102) — abandonment is not a revert. Validation remains a separate explicit action (BAS-063); the wizard never auto-validates.

---

## Workflow

```
[User selects a PDF file]
          │
          ▼
[Parse statement] (backend)
  → Extract IBAN, period, VIR SEPA lines
          │
          ▼
[Resolve bank account] (backend)
  → Search by IBAN
  → If not found: show inline create form (see BAS-011, BAS-012)
                  → IBAN pre-filled (read-only), name required
                  → On submit: backend create (BAS-013)
                      → success → continue to label-mapping (BAS-014)
                      → loading state during call (BAS-015)
                      → backend error → inline feedback (BAS-016)
                  → On cancel: close modal, abandon import (BAS-017)
          │
          ▼
[Build draft] (backend, BAS-064)
  → Apply existing label mappings (pre-fill) + heuristic suggestions
  → Auto-match resolved lines (fund + amount + date tolerance, BAS-050–054)
  → Produce the full line list with per-line status (BAS-061)
          │
          ▼
[Unified reconciliation list] (frontend, BAS-060)
  → All lines in document order, each with status + summary count
  │
  ├─ Correct a line (double-click, BAS-062) ──┐
  │     link-fund (cascade, BAS-066)          │   each correction →
  │     assign-group(s) (1..N, BAS-090)       │   recompute draft (BAS-064)
  │     acknowledge remainder (BAS-092)       │   → status/proposals update
  │     revert (BAS-065)                      │
  ├─ Guided wizard (BAS-100–102) ─────────────┘
  │     phase 1: all link-fund → phase 2: all assign-group
          │
          ▼
[Validate] (backend, BAS-063)
  → Persist label mappings (upsert, BAS-035)
  → Create bank transfers (N per multi-group line, BAS-093)
  → Procedures → FundPayed / PartiallyFundPayed; groups locked → BankPayed
  → Unresolved lines skipped; acknowledged remainders create nothing
          │
          ▼
[Summary: number of transfers created]
```

---

## Accepted limitations

- **Non-atomic validate (deferred UoW)**: validate commits multiple bank transfers and group/procedure status updates across more than one transaction (no enclosing unit of work). A process crash mid-validate can leave a partial commit. Accepted for now — single-user desktop makes the window practically unobservable (see `docs/techdebt.md` 2026-05-19 "Non-atomic bank-reconciliation writes" and ADR-003). To be revisited when UoW infrastructure lands.
- **Remainder is not recorded**: an acknowledged remainder (BAS-092) leaves no trace after the flow closes — it is a session-only acknowledgment, not an audit record. A persisted "aid payment" concept is intentionally out of scope (deferred).

## Open questions

None — all questions have been resolved.
