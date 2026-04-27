# Business Rules — Automatic Bank Reconciliation via PDF Import (bank-statement-auto-match)

## Context

A practitioner receives bank statements (PDF) issued by their bank, listing transfers received from health-insurance funds. This feature **automatically reconciles** these transfers with existing fund-payment groups, completing the procedure-payment lifecycle (Stage 2).

This document covers exclusively the **automatic flow**: PDF parsing, fund-label resolution, mandatory user review of mappings, matching algorithm, user review, and creation of bank transfers.

---

## Business Rules

### Bank-account identification

**R1 — Account resolution by IBAN (backend)**: The IBAN extracted from the PDF is used to identify the bank account. If no account matches, the workflow stops — the account must be created manually beforehand.

### Statement parsing

**R2 — Extracted data (backend)**: The parser extracts from the statement: the IBAN, the period covered, and the VIR SEPA credit lines.

**R3 — VIR SEPA lines only (backend)**: Only SEPA transfers are processed. Other operations on the statement (refunds, non-SEPA transfers, fees, etc.) are ignored.

**R4 — Unparsed lines (backend + frontend)**: The number of lines not recognized by the parser is shown as a warning.

### Fund-label resolution

**R8 — Rejecting a label (frontend + backend)**: A label can be marked as rejected — it identifies a transfer that is not a fund payment. A rejected label is excluded from matching. Rejection is a valid assignment, on par with a fund.

**R5 — Label → fund mapping (backend)**: Each transfer label (e.g. `CPAM93`) is mapped to a fund. If an existing mapping is found for this account and this label, the saved value (fund or rejected, see R8) is passed to the frontend for pre-fill.

**R6 — Heuristic suggestion (backend)**: For a label without a known mapping, the system tries to identify a candidate fund in two stages, in this priority order:

1. **Prefixed extraction**: the system looks in the label for a digit sequence immediately preceded by the prefix `CPAM` or `CAISSE` (case-insensitive). If this sequence matches exactly the `fund_identifier` of a known fund, that fund is selected.
2. **Name match** (fallback): the label (uppercased) is compared with each known fund's name (uppercased, spaces removed). The match score is: length of the fund name if the label fully contains it, length of the label if the fund name fully contains it, or length of the common prefix otherwise. The fund with the best score is selected if that score is at least 3 characters.

The suggestion, if any, is sent to the frontend as informational (see R28).

**R28 — Display of the heuristic suggestion (frontend)**: When a suggestion exists for an unknown label (see R6), it is displayed as helper text below the selection field. It is never pre-selected in the field. If no suggestion exists for an unknown label, nothing is displayed below the field.

**R7 — Mapping step always required (frontend)**: The mapping step is always shown for the full set of labels extracted from the statement — including labels whose mapping is already known (pre-filled with their saved value) and unknown labels (empty field). The user can edit any assignment before validating.

**R9 — Mapping persistence (frontend + backend)**: When the mapping step is validated, the frontend transmits the full set of displayed assignments (all labels, modified or not). The backend saves each assignment (fund or rejected, see R8) via an upsert, the unique key being the combination `(bank account, label)`. Saved values serve as pre-fill for the next imports of the same account.

**R23 — Empty field for unknown label (frontend)**: For a label with no saved mapping, the selection field is shown empty — no default value or suggestion is pre-selected. The user must make an explicit choice (fund or reject).

**R24 — "Accept" button — fixed position (frontend)**: The mapping step displays an "Accept" button positioned at the top of the modal, in fixed position so it stays visible while scrolling the label list.

**R25 — "Accept" button — activation condition (frontend)**: The "Accept" button is disabled as long as at least one label has no selection — neither via a pre-filled saved mapping, nor via a manual choice made in the current session. It becomes active as soon as all labels have an assignment (fund or rejected, see R8).

**R26 — No VIR SEPA lines (backend + frontend)**: If the statement contains no VIR SEPA line after filtering (see R3), the backend returns a structured error distinct from an empty result. The frontend displays an explicit error message and stops the workflow — no further step is reachable.

**R27 — Display order of labels in the mapping step (frontend)**: Labels are shown in two blocks:

1. Labels without a saved mapping (unknown), sorted alphabetically by label.
2. Labels with a saved mapping (fund or rejected, see R8), sorted alphabetically by label.

Within each block, sorting is strictly alphabetical on the label as it appears in the statement.

### Matching algorithm

**R10 — Match criteria (backend)**: A fund-payment group is a candidate for a credit line if all three of the following conditions are met:

1. The group's fund matches the line's resolved fund
2. The group's total amount is strictly equal to the line's amount
3. The bank date is within the date tolerance (see R11)

**R11 — Date tolerance (backend)**: The bank line's date can be 0 to 7 days after the payment-group's date (typical delay between the fund's accounting date and the receipt of the transfer).

**R12 — Priority to oldest lines (backend)**: Lines are sorted by ascending date before matching. In case of conflict (multiple candidate lines for the same group), the oldest line is processed first.

**R13 — Already-reconciled groups excluded (backend)**: A group already linked to a bank transfer is excluded from the matching pool.

**R14 — Exclusive matching (backend)**: A group and a line can only be associated once. As soon as a match is established, both are locked for the rest of the processing.

### User review and manual correction

**R15 — User review (frontend)**: Automatic-matching results are submitted for validation. The user views matched and unmatched lines.

**R16 — Manual override (frontend)**: The user can edit a proposed assignment: reassign a line to a different group, or unassign it.

**R17 — Broadened search (frontend)**: A "Broaden search" button shows all candidate groups beyond the fund filter, while keeping the date tolerance. Groups are listed by match order (exact amount first, then by date proximity).

**R18 — Unmatched lines non-blocking (frontend)**: An unmatched line does not block validation. Only lines with an assigned group result in transfer creation.

### Transfer creation and status updates

**R19 — Bank transfer creation (backend)**: For each validated match, a bank transfer is created and linked to the corresponding fund-payment group.

**R20 — Procedure status updates (backend)**: All procedures in the group move to their final status:

- `Reconciliated` → `FundPayed` (`actual_payment_amount` = procedure amount)
- `PartiallyReconciled` → `PartiallyFundPayed` (`actual_payment_amount` preserved)

**R21 — Group locking (backend)**: As soon as a group is reconciled at the bank level, it becomes locked — it can no longer be edited or deleted from the fund-reconciliation flow.

**R22 — Group status update (backend)**: When the bank transfer is created, the associated fund-payment group moves to `BankPayed` status.

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
  → If not found: stop + user message
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

- [x] **ADR-001 — `BankFundLabelMapping`**: Persistence decisions (composite key `(bank_account_id, bank_label)`, check-then-update upsert, reject = `fund_id NULL`, soft-delete + partial index) are documented in [docs/adr/001-bank-fund-label-mapping-persistence.md](../adr/001-bank-fund-label-mapping-persistence.md).

No blocking open questions — all decisions have been made.
