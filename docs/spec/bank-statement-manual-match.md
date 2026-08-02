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

**R13 — Automatic account for the CASH type (frontend + backend)**: For a `CASH` transaction, the account is automatically the default cash account — no account selection is offered to the user. The cash account is identified by the fixed id `cash-account-default` (pre-created by migration). Its display name comes from i18n, not from the database.

**R14 — Creation: procedure selection (frontend + backend)**: The user selects one or more procedures in `Created` status whose execution date (`procedure_date`) is within the 7 days preceding the payment date. The selection UI is similar to the procedure-management UI in fund-payment groups. The payment amount is the sum of the amounts of the selected procedures.

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
