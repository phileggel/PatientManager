# Business Rules — Manual Reconciliation (FPM)

## Context

A practitioner receives transfers from health-insurance funds (CPAM, etc.) as payment for reimbursed procedures. This feature lets the user **manually group** procedures into a fund-payment group, in order to trace the link between the procedures performed and the payments received from the fund.

This document covers exclusively the **manual flow**: creating, editing, and deleting groups from the user interface.

---

## Business Rules

### Procedure status lifecycle (010)

**FPM-010 (R0) — Status lifecycle (backend)**: A procedure's status evolves in two stages, coming from two distinct features:

- **Stage 1 — Fund reconciliation** (manual or automatic): the procedure goes from `Created` to `Reconciliated` (full payment accepted) or `PartiallyReconciled` (contested amount). In both cases, `fund_reconciliation_date` and `actual_payment_amount` are populated.
- **Stage 2 — Bank reconciliation** (`bank-statement-match` feature): when the transfer is detected on the bank statement, the procedure moves to its final status: `Reconciliated` → `FundPayed`, `PartiallyReconciled` → `PartiallyFundPayed`.

A group becomes locked as soon as one of its procedures reaches Stage 2 (see FPM-330).

### Procedure eligibility (100–110)

**FPM-100 (R1) — Procedures eligible for selection (backend)**: Only procedures in `Created` status can be added to a group, whether at creation or edit time. On edit, the picker shows two distinct sections: procedures already in the group (`Reconciliated` or `PartiallyReconciled`, removable) and available procedures (`Created`, addable). Procedures in any other status (`FundPayed`, `PartiallyFundPayed`, etc.) are excluded.

**FPM-110 (R2) — Fund membership (backend)**: Procedures offered for selection are filtered by fund. Only procedures associated with the fund chosen for the group are offered.

### Group creation (200–220)

**FPM-200 (R3) — Required fields (frontend + backend)**: Creating a group requires: a fund, a valid payment date, and at least one selected procedure. These three conditions are checked before submission.

**FPM-210 (R4) — Computed total amount (backend)**: The group's total amount is always equal to the sum of the `procedure_amount` of the associated procedures. It is not entered manually and is recomputed on every change to the procedure list. In the manual flow, since `actual_payment_amount` is populated with `procedure_amount` on add (see FPM-320), the invariant `total_amount = Σ actual_payment_amount` is also guaranteed.

**FPM-220 (R5) — Per-group uniqueness (backend)**: A fund-payment group bundles one or more procedures from the same fund, paid on the same date. There is no strict uniqueness constraint on date and fund — multiple groups can coexist for the same combination (e.g. two transfers received the same day from the same CPAM).

### Group edit (300–350)

**FPM-300 (R6) — Editable fields (frontend + backend)**: The payment date and the procedure list can be edited. The fund associated with the group cannot be changed. The total amount is not editable — it is always recomputed automatically (see FPM-210).

**FPM-310 (R7) — Removing a procedure (backend)**: When a procedure is removed from the group at validation time, its status reverts to `Created`, its actual payment amount (`actual_payment_amount`) and its `fund_reconciliation_date` are cleared, and the group total is recomputed accordingly.

**FPM-320 (R8) — Adding a procedure (backend)**: When a `Created` procedure is added to the group at validation time, its status moves to `Reconciliated` (default), its `fund_reconciliation_date` is set to the group's payment date, its `actual_payment_amount` is set to its procedure amount, and the group total is recomputed accordingly. ⚠️ Letting the user pick the target status (`Reconciliated` or `PartiallyReconciled`) is a future enhancement and is not implemented.

**FPM-330 (R9) — Lock after bank reconciliation (backend)**: A group cannot be edited or deleted if one of its procedures has been reconciled at the bank level (status `FundPayed` or `PartiallyFundPayed`). These statuses are set by the `bank-statement-match` feature (Stage 2 of the lifecycle, see FPM-010). The lock is derived from the group's `BankPayed` status (see FPM-340).

**FPM-340 (R10) — Group status (backend)**: The group has its own status: `Active` (editable) or `BankPayed` (locked). Both bank-reconciliation features (`bank-statement-auto-match` and `bank-statement-manual-match`) move the group to `BankPayed` when a transfer is created, and back to `Active` if it is deleted. The group read (`read_all_fund_payment_groups`) also recomputes `is_locked` from the procedures' statuses to guarantee consistency.

**FPM-350 (R18) — Visual feedback for locked state (frontend)**: A locked group is signaled in the list by a 🔒 icon next to the fund name and a reduced opacity on the row. The edit and delete buttons are visually disabled (reduced opacity, forbidden cursor).

### Group deletion (400–410)

**FPM-400 (R11) — Deletion with reset (backend)**: Deleting a group resets all associated procedures to their initial state: their status reverts to `Created`, the `fund_reconciliation_date` and the actual payment amount are cleared. Deletion is blocked if the group is locked (see FPM-330).

**FPM-410 (R12) — Confirmation required (frontend)**: Deleting a fund-payment group requires explicit user confirmation before being executed.

### Navigation and UX (500–560)

**FPM-500 (R13) — Monthly filtering (frontend)**: In the procedure picker, procedures can be filtered by month and year to make selection easier in long lists.

**FPM-510 (R14) — Procedure picker layout (frontend)**: At creation, selected procedures are pinned to the top of the list. On edit, the modal shows only the procedures already in the group (removable by unchecking). An "Add procedures" button opens a dedicated picker (see FPM-550) to add new procedures.

**FPM-520 (R15) — Selection summary (frontend)**: While selecting procedures, a summary displays in real time the number of selected procedures and the corresponding total amount.

**FPM-530 (R16) — Double-click to edit (frontend)**: A double-click on a row in the groups list opens the edit form for the corresponding group.

**FPM-540 (R17) — Search in the list (frontend)**: The fund-payment groups list can be filtered by fund name or by payment date.

**FPM-550 (R19) — Adding procedures during edit (frontend + backend)**: In the edit modal, an "Add procedures" button opens a modal picker showing all `Created` procedures from the same fund whose `procedure_date` is less than or equal to the group's payment date. Procedures already in the group are excluded. Selection has the same effects as at creation (see FPM-320): status `Reconciliated`, `fund_reconciliation_date` and `actual_payment_amount` populated, total recomputed.

**FPM-560 (R20) — Persistent summary in the edit modal (frontend)**: The edit modal permanently displays a summary bar showing the number of selected procedures and the corresponding total amount (sum of the `procedure_amount` of the selected procedures). This summary is updated in real time on every add or remove.

---

## Workflow

### Creation

```
[User selects a fund and a date]
          │
          ▼
[Open the procedure picker]
  → Load available procedures (Created status, same fund)
  → Filter by month/year if needed
  → User selection (with real-time summary)
          │
          ▼
[Form submission]
  → Check: fund, date, at least one selected procedure
          │
          ▼
[Group creation (backend)]
  → Compute total amount (sum of procedures)
  → Persist group and lines
  → Added procedures → status Reconciliated + fund_reconciliation_date + actual_payment_amount
          │
          ▼
[Refresh groups list]
```

### Edit

```
[User opens the form (double-click or button)]
  → Lock check: if any procedure is FundPayed/PartiallyFundPayed → inaccessible
          │
          ▼
[Load picker]
  → Current procedures (Reconciliated/PartiallyReconciled) — preselected, removable
  → Available procedures (Created, same fund) — addable
          │
          ▼
[User edits the date and/or the procedure list]
          │
          ▼
[Validation (backend)]
  → Removed procedures → status Created, actual_payment_amount and fund_reconciliation_date cleared
  → Added procedures → status Reconciliated (see FPM-320), fund_reconciliation_date and actual_payment_amount set
  → Total recomputed (sum of remaining + added procedures)
          │
          ▼
[Refresh groups list]
```

### Deletion

```
[User clicks delete]
  → Lock check: if any procedure is FundPayed/PartiallyFundPayed → inaccessible
          │
          ▼
[Explicit confirmation required]
          │
          ▼
[Deletion (backend)]
  → All procedures in the group → status Created, actual_payment_amount and fund_reconciliation_date cleared
  → Delete group and its lines
          │
          ▼
[Refresh groups list]
```

---

## Open Questions

- [x] **confirmed_payment_date at fund-reconciliation vs. bank-transfer time**: Resolved — `confirmed_payment_date` will remain the bank-transfer date (Stage 2). A new `fund_reconciliation_date` column will be added to `Procedure` to record the Stage 1 fund-document payment date separately. See docs/todo.md for the migration task. See also: fund-payment-auto-match spec (same resolution).
