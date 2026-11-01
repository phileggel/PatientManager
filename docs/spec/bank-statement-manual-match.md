# Business Rules — Manual Bank Reconciliation (bank-statement-manual-match)

## Context

A practitioner can record incoming payments manually, whether they come from health-insurance fund transfers (`FUND`) or direct patient payments (check, credit card, cash). This feature **creates and manages** these transactions and updates the procedure statuses — and, for `FUND` transfers, the corresponding fund-payment groups.

This document covers exclusively the **manual flow**: direct entry of transactions.

---

## Business Rules

### Procedure status lifecycle

**R1 — Status lifecycles (backend)**: Two distinct lifecycles depending on the transaction type:

- **Fund lifecycle** (`FUND` transfer): the procedure goes through two stages — first the fund reconciliation (`Created` → `Reconciliated` / `PartiallyReconciled`), then the bank reconciliation (`Reconciliated` → `FundPayed`, `PartiallyReconciled` → `PartiallyFundPayed`). This document covers Stage 2.
- **Direct lifecycle** (direct payment `CHECK`, `CREDIT_CARD`, `CASH`): the procedure goes directly from `Created` to `DirectlyPayed` in a single stage — no prior fund reconciliation. The payment method, date, and actual paid amount are populated.

A fund-payment group becomes locked as soon as one of its procedures reaches Stage 2 of the fund lifecycle — it can no longer be edited or deleted. Unlocking can only be performed by deleting the associated transfer (see R8).

> **Declared exception (2026-07-31)** — bank-born groups (`bank-statement-auto-match` BAS-115) fold Stage 1 into the bank validate (`Created` → `FundPaid` in one step). After validate they are ordinary groups: deleting their transfer (R8) reverts them like any other (procedures → `Reconciled`, group `Active`).

### Rules common to all transactions

**R2 — Transaction types (backend)**: Four types are supported: `FUND` (fund transfer), `CHECK` (check), `CREDIT_CARD` (credit card), `CASH` (cash). The `OutgoingWire` type is exclusively reserved for the overpayment-refund flow and cannot be created via this flow (see REF-080).

**R3 — Transaction fields (frontend + backend)**: A transaction is defined by a bank account, a date, and a type. The amount is computed dynamically in real time from the selected items (groups or procedures) and cannot be entered manually. Exception for the `CASH` type: see R13.

**R4 — Immutable type (frontend + backend)**: A transaction's type cannot be changed once defined. It is impossible to switch from `FUND` to a direct type (or vice versa), nor to change the type within the direct types (`CHECK`, `CREDIT_CARD`, `CASH`).

**R5 — Transaction deletion (frontend + backend)**: Deletion requires explicit confirmation. It is irreversible — the transaction is permanently erased (hard delete) along with its links to the associated fund-payment groups or procedures.

**BSM-020 — Creation refusals, all at once (backend)**: Creating a bank entry (FUND or direct) is refused when its account is missing (not for `CASH`, BSM-026), its date is missing (a blank date counts as missing), its date is not a valid `YYYY-MM-DD` date, or no group or procedure is selected. Every reason is given in one answer, each tied to its field, and nothing is written.

**BSM-021 — Field refusals come first (backend)**: The refusals of BSM-020 and BSM-030 are answered before any other check — an unknown bank entry, account (not for `CASH`, BSM-026), group or procedure (BSM-036), a wrong type (R4), or the refund-only type (REF-080): a form with a refused field is refused for its fields alone.

**BSM-022 — The form does not judge its fields (frontend)**: The bank entry forms, creation and edit, FUND and direct, never check their own fields: Save is enabled whenever they are not saving and sends the form as it is (BSM-020, BSM-030 judge it).

**BSM-023 — Refusals at the field (frontend)**: When a save is refused under BSM-020 or BSM-030, each reason is shown as an error under its field — the date (missing and invalid have different messages), the account, the selection (below both lists, in the edit dialog). A new save clears every message first; any other refusal shows no message at a field.

**BSM-024 — A refused save keeps the form (frontend)**: When a save is refused, for any reason, the form or dialog stays open and an error snackbar is shown.

**BSM-025 — A field's message clears when it is edited (frontend)**: A message of BSM-023 clears once its field is edited; for the selection, once a group or procedure is added or removed, in the broadened search too (R12, R20). Changing the type at creation clears the account and selection messages. While the date is missing or invalid, the 7-day selection shows no candidate (the broadened search has no date window, R12, R20).

**BSM-026 — A cash entry is on the cash account (backend)**: A `CASH` bank entry is always recorded on the cash account (R13); an account given with it is ignored, even an unknown one.

**BSM-030 — Edit refusals, all at once (backend)**: Editing a bank entry is refused when its date is missing (a blank date counts as missing), its date is not a valid `YYYY-MM-DD` date, or no group or procedure is selected. Every reason is given in one answer, each tied to its field, and nothing is written. The account is not part of an edit (R9, R17).

**BSM-031 — An unchanged edit (backend)**: An edit nothing refuses whose date and selection (as a set, order aside) equal the stored bank entry's is answered unchanged: nothing is written and none of `ProcedureUpdated`, `FundPaymentGroupUpdated`, `BankEntryUpdated` is published.

**BSM-032 — An unchanged edit closes silently (frontend)**: When an edit is answered unchanged (BSM-031), the edit dialog closes with no snackbar and the list is not refreshed.

**BSM-033 — The edit dialog shows the account (frontend)**: The edit dialog shows the bank entry's account as text — the stored account's name, the cash account's translated name for `CASH` (R13) — and offers no way to change it (R9, R17).

**BSM-034 — A refused bank entry changes nothing (backend)**: Creating or editing a bank entry writes the entry, its links and all it changes on the groups and procedures it adds, keeps or removes (R7, R8, R10, R11, R15, R16, R18, R19, BSM-035) together. When the creation or edit is refused or fails, all of them stay as they were and none of `ProcedureUpdated`, `FundPaymentGroupUpdated`, `BankEntryUpdated` is published.

**BSM-035 — What an edit keeps follows its date (backend)**: A group or procedure an edit keeps stays settled or paid, and its `confirmed_payment_date` becomes the edited date.

### FUND-type transfers

**R6 — Creation: group selection (frontend + backend)**: The user selects one or more fund-payment groups among those not yet reconciled at the bank level, whose payment date is within the 7 days preceding the transfer date. The selection UI is similar to the procedure-management UI in fund-payment groups. The transfer amount is the sum of the total amounts of the selected groups.

**R7 — Creation: status effects (backend)**: On validation, the procedures of the selected groups move to their final status (`Reconciliated` → `FundPayed`, `PartiallyReconciled` → `PartiallyFundPayed`) and the groups move to `BankPayed` status. See the "Affected fields — on transfer creation" table.

**R8 — Deletion: rollback (backend)**: Deleting a `FUND` transfer reverts the procedures of the associated groups to their prior state (`FundPayed` → `Reconciliated`, `PartiallyFundPayed` → `PartiallyReconciled`) and moves the groups back to `Active` status. The procedures' confirmed payment date is restored to the date of the fund-payment group.

**R9 — Edit: editable fields (frontend + backend)**: The transfer date and the composition of selected groups can be edited. The same selection rules as at creation apply (7-day window, broadened search via R12). The amount is recomputed accordingly.

**R10 — Edit: adding a group (backend)**: Adding a group has the same effects on procedure and group statuses as at creation (see R7).

**R11 — Edit: removing a group (backend)**: Removing a group has the same effects on procedure and group statuses as at deletion (see R8).

**R12 — Broadened search (frontend)**: When the desired group is not in the initial selection (outside the 7-day window), a "Broaden search" button opens a modal showing all groups not yet reconciled at the bank level, with no date constraint. Filterable by fund (identifier or name). Sorted by descending payment date. Available at creation and edit.

**Affected fields — on transfer creation**

| Entity    | Field                    | Value                                                                        |
| --------- | ------------------------ | ---------------------------------------------------------------------------- |
| Procedure | `payment_status`         | `Reconciliated` → `FundPayed` / `PartiallyReconciled` → `PartiallyFundPayed` |
| Procedure | `payment_method`         | `BankTransfer`                                                               |
| Procedure | `confirmed_payment_date` | = transfer date                                                              |
| Procedure | `actual_payment_amount`  | preserved                                                                    |
| Group     | `status`                 | `Active` → `BankPayed`                                                       |
| Group     | `is_locked`              | → true                                                                       |

**Affected fields — on transfer deletion**

| Entity    | Field                    | Value                                                                        |
| --------- | ------------------------ | ---------------------------------------------------------------------------- |
| Procedure | `payment_status`         | `FundPayed` → `Reconciliated` / `PartiallyFundPayed` → `PartiallyReconciled` |
| Procedure | `payment_method`         | cleared                                                                      |
| Procedure | `confirmed_payment_date` | = group date                                                                 |
| Procedure | `actual_payment_amount`  | preserved                                                                    |
| Group     | `status`                 | `BankPayed` → `Active`                                                       |
| Group     | `is_locked`              | → false                                                                      |

### Direct payments (CHECK / CREDIT_CARD / CASH)

**R13 — Automatic account for the CASH type (frontend + backend)**: For a `CASH` transaction, the account is automatically the default cash account — no account selection is offered to the user. The cash account is identified by the fixed id `cash-account-default` (pre-created by migration). Its display name comes from i18n, not from the database. The account it is stored on is BSM-026's.

**R14 — Creation: procedure selection (frontend + backend)**: The user selects one or more procedures in `Created` status whose execution date (`procedure_date`) is within the 7 days preceding the payment date. The selection UI is similar to the procedure-management UI in fund-payment groups. The payment amount is the sum of the amounts of the selected procedures.

**BSM-036 — Every selected procedure exists (backend)**: Creating or editing a direct bank entry whose selection holds a procedure that does not exist or is deleted is refused with a specific error, even beside procedures that exist, and one the edit keeps is judged too. The field refusals of BSM-021 come first; an edit answered unchanged (BSM-031) is not judged.

**R15 — Creation: status effects (backend)**: On validation, each procedure receives the corresponding payment method, its date and actual paid amount are set, and its status moves to `DirectlyPayed`. See the "Affected fields — on payment creation" table.

**R16 — Deletion: rollback (backend)**: Deleting a direct payment reverts the associated procedures to `Created` status and clears their payment method, date, and actual paid amount.

**R17 — Edit: editable fields (frontend + backend)**: The payment date and the composition of selected procedures can be edited. The same selection rules as at creation apply (7-day window, broadened search via R20). The amount is recomputed accordingly.

**R18 — Edit: adding a procedure (backend)**: Adding a procedure has the same effects on its statuses and fields as at creation (see R15).

**R19 — Edit: removing a procedure (backend)**: Removing a procedure has the same effects on its statuses and fields as at deletion (see R16).

**R20 — Broadened search (frontend)**: When the desired procedure is not in the initial selection (outside the 7-day window), a "Broaden search" button opens a modal showing all procedures in `Created` status, with no date constraint. Search by patient name, SSN, or execution date. Sorted by descending `procedure_date`. Available at creation and edit.

**R21 — Edit form pre-fill (frontend)**: When the edit form opens, the date is pre-filled with the existing transfer's date. For `FUND` transfers, the currently linked groups (`BankPayed` status) are shown pre-selected in a dedicated section, so the user can remove them if desired. For direct payments, the currently linked procedures (`DirectlyPayed` status) are shown pre-selected in the same way.

**Affected fields — on payment creation**

| Entity    | Field                    | Value                                                                                  |
| --------- | ------------------------ | -------------------------------------------------------------------------------------- |
| Procedure | `payment_status`         | `Created` → `DirectlyPayed`                                                            |
| Procedure | `payment_method`         | `Check` / `BankCard` / `Cash` (depending on the `CHECK` / `CREDIT_CARD` / `CASH` type) |
| Procedure | `confirmed_payment_date` | = payment date                                                                         |
| Procedure | `actual_payment_amount`  | = procedure amount                                                                     |

**Affected fields — on payment deletion**

| Entity    | Field                    | Value                       |
| --------- | ------------------------ | --------------------------- |
| Procedure | `payment_status`         | `DirectlyPayed` → `Created` |
| Procedure | `payment_method`         | cleared                     |
| Procedure | `confirmed_payment_date` | cleared                     |
| Procedure | `actual_payment_amount`  | cleared                     |

---

## Workflow

### Entering a FUND transfer

```
[User picks the FUND type, the account, and the date]
          │
          ▼
[Select fund-payment groups]
  → Groups not yet reconciled at the bank level
  → Within the 7 days preceding the transfer date
  → Total amount computed in real time
  → [Broaden search] → modal: all groups, fund filter, descending date sort
          │
          ▼
[Validation]
  → Groups → BankPayed, procedures → FundPayed / PartiallyFundPayed
```

### Entering a direct payment (CHECK / CREDIT_CARD / CASH)

```
[User picks the type, the account, and the date]
          │
          ▼
[Select procedures]
  → Procedures in Created status
  → Within the 7 days preceding the payment date
  → Total amount computed in real time
  → [Broaden search] → all procedures, search by patient/SSN/date, descending procedure_date sort
          │
          ▼
[Validation]
  → Procedures → DirectlyPayed
```

### Editing a FUND transfer

```
[User edits the date and/or the group selection]
  → Groups not yet reconciled at the bank level
  → Within the 7 days preceding the transfer date
  → [Broaden search] → all groups, fund filter, descending date sort
  → Amount recomputed in real time
          │
          ▼
[Validation]
  → Old groups → Active, new groups → BankPayed
  → Procedure statuses updated accordingly
```

### Editing a direct payment (CHECK / CREDIT_CARD / CASH)

```
[User edits the date and/or the procedure selection]
  → Procedures in Created status
  → Within the 7 days preceding the payment date
  → [Broaden search] → all procedures, search by patient/SSN/date, descending procedure_date sort
  → Amount recomputed in real time
          │
          ▼
[Validation]
  → Old procedures → Created, new procedures → DirectlyPayed
```

### Deleting a FUND transfer

```
[User deletes a FUND transfer]
  → Explicit confirmation required
          │
          ▼
[Transfer and links permanently deleted]
  → Procedures and groups reverted to their prior state (Active / Reconciliated)
```

### Deleting a direct payment (CHECK / CREDIT_CARD / CASH)

```
[User deletes a direct payment]
  → Explicit confirmation required
          │
          ▼
[Payment and links permanently deleted]
  → Procedures reverted to Created status
```

## Open Questions

- [x] Which account does a `CASH` creation store (R13)? — Decided by the owner on 2026-10-24
      (#455): the cash account, set by the backend whatever it is sent.
- [ ] May a `CHECK` or `CREDIT_CARD` bank entry be recorded on the cash account? `bank-account.md`
      BAC-050 keeps it for cash payments; the form leaves it out of its list, the backend accepts it.
      (Owner.)
