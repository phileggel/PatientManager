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

**BAS-034 (R7) — Mapping step always required (frontend)**: The mapping step is always shown for the full set of labels extracted from the statement — including labels whose mapping is already known (pre-filled with their saved value) and unknown labels (empty field). The user can edit any assignment before validating.

**BAS-035 (R9) — Mapping persistence (frontend + backend)**: When the mapping step is validated, the frontend transmits the full set of displayed assignments (all labels, modified or not). The backend saves each assignment (fund or rejected, see BAS-030) via an upsert, the unique key being the combination `(bank account, label)`. Saved values serve as pre-fill for the next imports of the same account.

**BAS-036 (R23) — Empty field for unknown label (frontend)**: For a label with no saved mapping, the selection field is shown empty — no default value or suggestion is pre-selected. The user must make an explicit choice (fund or reject).

**BAS-037 (R24) — "Accept" button — fixed position (frontend)**: The mapping step displays an "Accept" button positioned at the top of the modal, in fixed position so it stays visible while scrolling the label list.

**BAS-038 (R25) — "Accept" button — activation condition (frontend)**: The "Accept" button is disabled as long as at least one label has no selection — neither via a pre-filled saved mapping, nor via a manual choice made in the current session. It becomes active as soon as all labels have an assignment (fund or rejected, see BAS-030).

**BAS-039 (R26) — No VIR SEPA lines (backend + frontend)**: If the statement contains no VIR SEPA line after filtering (see BAS-021), the backend returns a structured error distinct from an empty result. The frontend displays an explicit error message and stops the workflow — no further step is reachable.

**BAS-040 (R27) — Display order of labels in the mapping step (frontend)**: Labels are shown in two blocks:

1. Labels without a saved mapping (unknown), sorted alphabetically by label.
2. Labels with a saved mapping (fund or rejected, see BAS-030), sorted alphabetically by label.

Within each block, sorting is strictly alphabetical on the label as it appears in the statement.

### Matching algorithm (050–059)

**BAS-050 (R10) — Match criteria (backend)**: A fund-payment group is a candidate for a credit line if all three of the following conditions are met:

1. The group's fund matches the line's resolved fund
2. The group's total amount is strictly equal to the line's amount
3. The bank date is within the date tolerance (see BAS-051)

**BAS-051 (R11) — Date tolerance (backend)**: The bank line's date can be 0 to 7 days after the payment-group's date (typical delay between the fund's accounting date and the receipt of the transfer).

**BAS-052 (R12) — Priority to oldest lines (backend)**: Lines are sorted by ascending date before matching. In case of conflict (multiple candidate lines for the same group), the oldest line is processed first.

**BAS-053 (R13) — Already-reconciled groups excluded (backend)**: A group already linked to a bank transfer is excluded from the matching pool.

**BAS-054 (R14) — Exclusive matching (backend)**: A group and a line can only be associated once. As soon as a match is established, both are locked for the rest of the processing.

### User review and manual correction (060–069)

**BAS-060 (R15) — User review (frontend)**: Automatic-matching results are submitted for validation. The user views matched and unmatched lines.

**BAS-061 (R16) — Manual override (frontend)**: The user can edit a proposed assignment: reassign a line to a different group, or unassign it.

**BAS-062 (R17) — Broadened search (frontend)**: A "Broaden search" button shows all candidate groups beyond the fund filter, while keeping the date tolerance. Groups are listed by match order (exact amount first, then by date proximity).

**BAS-063 (R18) — Unmatched lines non-blocking (frontend)**: An unmatched line does not block validation. Only lines with an assigned group result in transfer creation.

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
[Resolve fund labels] (backend)
  → Apply existing mappings (pre-fill)
  → Heuristic suggestion for unknown labels (informational)
          │
          ▼
[Label mapping — always required] (frontend)
  → All labels shown: known ones pre-filled, unknown ones empty
  → Suggestion visible but not pre-selected for unknown labels
  → User validates, corrects, or completes each label
  → Save mappings (including edits)
          │
          ▼
[Automatic matching] (backend)
  → Lines sorted by ascending date
  → Match on fund + amount + date tolerance
  → Result: matched / unmatched
          │
          ▼
[User review] (frontend)
  → View proposed matches
  → Manual corrections allowed
          │
          ▼
[Validation] (backend)
  → Create bank transfers
  → Procedures → FundPayed / PartiallyFundPayed
  → Reconciled groups locked
          │
          ▼
[Summary: number of transfers created]
```

---

## Open questions

None — all questions have been resolved.
