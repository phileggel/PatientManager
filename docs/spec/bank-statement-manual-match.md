# Business Rules — Bank Statement Manual Match (BSM)

## Context

A practitioner records by hand the payments received: a fund's wire (`FundWire`) or a patient's direct payment by check, card or cash. This feature creates, edits and deletes these bank entries and moves the statuses of the procedures they pay — and, for a fund's wire, of the fund-payment groups it settles.

This document covers the manual flow only; the bank statement import is `bank-statement-auto-match`.

> Rules R1–R21 keep the numbers they shipped with; the newer ones are `BSM-NNN`. BSM-023, BSM-024, BSM-025, BSM-032 and BSM-033 described the screens and are vacant since #644. R12, R20 and R21 keep their numbers for the backend part of what they said: the candidates with no date bound, and the items an entry holds. Giving R1–R21 their `BSM-NNN` numbers is #638's.

---

## Entity Definition

### BankEntry

A payment received — a fund's wire or a patient's direct payment — or an overpayment refund paid out (REF-110).

| Field          | Business meaning                       |
| -------------- | -------------------------------------- |
| `bank_account` | The account it is recorded on.         |
| `date`         | The day it was received, or paid.      |
| `type`         | What the entry is; never changed.      |
| `amount`       | What it holds (R3); a refund: REF-110. |

A bank entry also holds the fund-payment groups a fund's wire settles, or the procedures a direct payment pays.

---

## Business Rules

### Procedure status lifecycle

**R1 — Status lifecycles (backend)**: Two distinct lifecycles depending on the bank entry's type:

- **Fund lifecycle** (a fund's wire): the procedure goes through two stages — first the fund reconciliation (`Created` → `Reconciled` / `PartiallyReconciled`), then the bank reconciliation (`Reconciled` → `FundPaid`, `PartiallyReconciled` → `PartiallyFundPaid`). This document covers Stage 2.
- **Direct lifecycle** (a direct payment): the procedure goes directly from `Created` to `DirectlyPaid` in a single stage — no prior fund reconciliation. The payment method, date, and paid amount are populated.

A fund-payment group becomes locked as soon as one of its procedures reaches Stage 2 of the fund lifecycle — it can no longer be edited or deleted. It is unlocked as R8 and R11 say.

> **Declared exception (2026-07-31)** — bank-born groups (`bank-statement-auto-match` BAS-115, and BSM-051 here) fold Stage 1 into the bank settlement (`Created` → `FundPaid` in one step). After their settlement they are ordinary groups: deleting their bank entry (R8) reverts them like any other (procedures → `Reconciled`, group `Active`).

### Rules common to all bank entries

**R2 — Bank entry types (backend)**: Four types are recorded here: `FundWire` (a fund's wire) and the direct payments `PatientCheck`, `PatientCreditCard` and `PatientCash`. `FundOutgoingWire` is reserved for the overpayment-refund flow and cannot be created via this flow (REF-080).

**R3 — Bank entry fields (backend)**: A bank entry is defined by a bank account, a date and a type. Its amount is the sum of the items it holds — the total amounts of its groups, or the billed amounts of its procedures — and is never entered. The account is not chosen for a direct payment (R13).

**R4 — Immutable type (backend)**: A bank entry's type cannot be changed once defined. Editing or deleting, as a fund's wire, an entry that is not a `FundWire`, or, as a direct payment, an entry that is not one — a refund's entry included (REF-110) — is rejected with a specific error.

**R5 — Bank entry deletion (backend)**: A deletion is irreversible — the bank entry is permanently erased (hard delete) along with its links to the fund-payment groups or procedures it held.

**BSM-020 — Creation refusals, all at once (backend)**: Creating a bank entry (a fund's wire or a direct payment) is refused when its account is missing (not for a direct payment, BSM-026), its date is missing (a blank date counts as missing), its date is not a valid `YYYY-MM-DD` date (a month or day of one digit is accepted: `2026-3-5` is kept as `2026-03-05`), or no group or procedure is selected. Every reason is given in one answer, each tied to its field, and nothing is written.

**BSM-021 — Field refusals come first (backend)**: The refusals of BSM-020 and BSM-030 are answered before any other check — an unknown bank entry, account (not for a direct payment, BSM-026) or group, a procedure of a direct selection (BSM-036), a wrong type (R4), or the refund-only type (REF-080): an entry with a refused field is refused for its fields alone.

**BSM-026 — A direct payment is on its technical account (backend)**: A patient's direct payment — a `PatientCash`, `PatientCheck` or `PatientCreditCard` bank entry created here — is recorded as BAC-056 says (owner, 2026-11-07, #518).

**BSM-027 — A fund's wire pays no procedure directly (backend)**: Recording, as a direct payment (R14, R15), an entry of type `FundWire` is refused with a specific error, after the field refusals (BSM-021) and before any selected procedure is judged (BSM-036, BSM-039); nothing is written (owner, 2026-11-07, #634). A fund's wire settles a procedure that is in no group only through the group BSM-051 creates for it.

**R21 — What a bank entry holds (backend)**: The groups a fund's wire holds, or the procedures a direct payment holds, can be read with their date and amount, although settled or paid: they are no longer in R12's or R20's set.

**BSM-028 — A selection is a set (backend)**: A group or procedure repeated in the selection of a bank entry, created or edited, counts once: in its amount, its links and the changes to statuses, as BSM-031 already compares a selection as a set.

**BSM-029 — An amount that is not positive (backend)**: Creating or editing a bank entry whose amount (R3) is not positive is rejected with a specific error, and nothing is written (BSM-034).

**BSM-030 — Edit refusals, all at once (backend)**: Editing a bank entry is refused when its date is missing (a blank date counts as missing), its date is not a valid `YYYY-MM-DD` date (read as BSM-020 says), or no group or procedure is selected. Every reason is given in one answer, each tied to its field, and nothing is written. The account is not part of an edit (R9).

**BSM-031 — An unchanged edit (backend)**: An edit nothing refuses whose date and selection (as a set, order aside) equal the stored bank entry's is answered unchanged: nothing is written and none of `ProcedureUpdated`, `FundPaymentGroupUpdated`, `BankEntryUpdated` is published.

**BSM-034 — A refused bank entry changes nothing (backend)**: Creating or editing a bank entry writes the entry, its links and all it changes on the groups and procedures it adds, keeps or removes (R7, R8, R10, R11, R15, R16, R18, R19, BSM-035) together. When the creation or edit is refused or fails, all of them stay as they were and none of `ProcedureUpdated`, `FundPaymentGroupUpdated`, `BankEntryUpdated` is published.

**BSM-035 — What an edit keeps follows its date (backend)**: A group or procedure an edit keeps stays settled or paid, and the `confirmed_payment_date` of the procedure, or of the group's procedures, becomes the edited date.

**BSM-040 — A refused or failed deletion changes nothing (backend)**: Deleting a bank entry removes the entry and its links and reverts its groups and procedures (R8, R16) together. A deletion is refused for an unknown bank entry or a wrong type (R4). When the deletion is refused or fails, all of them stay as they were and none of `ProcedureUpdated`, `FundPaymentGroupUpdated`, `BankEntryUpdated` is published.

### Fund wires

**R6 — Groups of the window (backend)**: The groups offered first for a fund's wire, created or edited, are those not yet settled at the bank level whose payment date is from 7 days before the wire's date to that date, both included. A missing or invalid date is rejected with a specific error.

**R7 — Creation: status effects (backend)**: When the wire is recorded, the procedures of its groups move to their final status (`Reconciled` → `FundPaid`, `PartiallyReconciled` → `PartiallyFundPaid`) and the groups move to `BankPaid` status. See the "Affected fields — on wire creation" table.

**R8 — Deletion: rollback (backend)**: Deleting a fund's wire reverts the procedures of its groups to their prior state (`FundPaid` → `Reconciled`, `PartiallyFundPaid` → `PartiallyReconciled`) and moves the groups back to `Active` status. The procedures' payment method and confirmed payment date are cleared; their fund reconciliation date and paid amount stay. An `Overpaid` procedure (REF-160) is left as it is (owner, 2026-11-22, #602).

**R9 — Edit: editable fields (backend)**: The date of a fund's wire and the groups it holds can be edited, never its account. A group it adds is one of R12's (BSM-037). The amount is recomputed accordingly.

**R12 — Every unsettled group (backend)**: A wire, created or edited, can hold any group not yet settled at the bank level, whatever its date: R6's window only narrows what is offered first, and the whole set can be read instead.

**R10 — Edit: adding a group (backend)**: Adding a group has the same effects on procedure and group statuses as at creation (see R7).

**R11 — Edit: removing a group (backend)**: Removing a group has the same effects on procedure and group statuses as at deletion (see R8).

**BSM-037 — A group is settled by one bank entry (backend)**: Creating a `FundWire` bank entry, or editing one, whose selection holds a group already settled at the bank level or locked is refused with a specific error naming the first such group in the selection's order, and nothing is written (BSM-034). A group the edited entry already holds is kept, settled on the new date (BSM-035). An unknown group is refused first (owner, 2026-11-07, #634).

**BSM-037A — A wire settles reconciled procedures (backend)**: Creating a `FundWire` bank entry, or editing one, whose selection holds a group with a procedure in neither `Reconciled` nor `PartiallyReconciled` status is refused with a specific error naming one such procedure, and nothing is written (BSM-034). An `Overpaid` procedure is not refused and is left as it is (R8). Groups are judged in the selection's order, each by BSM-037 first, then its procedures; a group the edited entry already holds is judged as R8 would leave it, then kept (BSM-035) (owner, 2026-11-22, #602).

**BSM-038 — One bank entry per group (backend)**: A fund-payment group is linked to at most one bank entry, whatever records it: this flow (BSM-037), the bank statement import (`bank-statement-auto-match` BAS-053 to BAS-053C) or a refund (`overpayment` REF-120).

**BSM-038A — A double link is repaired on upgrade (backend)**: A database that holds a group linked to several bank entries is repaired before it is upgraded, as BSM-038B to BSM-038E say (owner, 2026-11-21, #732; until then the upgrade stopped, #640). An imported backup is upgraded at the next start (`db-backup` R10), so it is repaired the same way.

**BSM-038B — A link to a missing entry (backend)**: In a group linked to several bank entries, a link to a bank entry that no longer exists is removed.

**BSM-038C — The most recent entry settles the group (backend)**: Of the existing bank entries linked to such a group, the one with the latest date goes on settling it; on one date, the one whose link was recorded last.

**BSM-038D — The other entries are kept (backend)**: Every other bank entry is unlinked from the group and kept: none is deleted, and it stays linked to its other groups. Its amount is not changed, and so stands above the sum of its groups — a declared exception to R3, until the wire is edited or deleted.

**BSM-038E — The group does not change (backend)**: The repair changes neither the group nor its procedures, their confirmed payment date included.

**BSM-038F — A failed repair stops the upgrade (backend)**: When the repair of BSM-038A fails, nothing it did is kept, the upgrade does not run, and the start-up fails as DGR-040 says.

**Affected fields — on wire creation**

| Entity    | Field                    | Value                                                                   |
| --------- | ------------------------ | ----------------------------------------------------------------------- |
| Procedure | `payment_status`         | `Reconciled` → `FundPaid` / `PartiallyReconciled` → `PartiallyFundPaid` |
| Procedure | `payment_method`         | `BankTransfer`                                                          |
| Procedure | `confirmed_payment_date` | = wire date                                                             |
| Procedure | `paid_amount`            | preserved                                                               |
| Group     | `status`                 | `Active` → `BankPaid`                                                   |
| Group     | `is_locked`              | → true                                                                  |

**Affected fields — on wire deletion**

| Entity    | Field                      | Value                                                                   |
| --------- | -------------------------- | ----------------------------------------------------------------------- |
| Procedure | `payment_status`           | `FundPaid` → `Reconciled` / `PartiallyFundPaid` → `PartiallyReconciled` |
| Procedure | `payment_method`           | cleared                                                                 |
| Procedure | `confirmed_payment_date`   | cleared                                                                 |
| Procedure | `fund_reconciliation_date` | preserved                                                               |
| Procedure | `paid_amount`              | preserved                                                               |
| Group     | `status`                   | `BankPaid` → `Active`                                                   |
| Group     | `is_locked`                | → false                                                                 |

### A fund's wire with no bordereau (050–059)

**BSM-050 — The open procedures of a fund (backend)**: The procedures offered for a wire recorded on open procedures (BSM-051) are the given fund's open procedures, defined and ordered as `bank-statement-auto-match` BAS-112 says — the oldest procedure date first, then the procedure's identifier; they are not bounded by the wire's date. A missing or unknown fund has none.

**BSM-051 — A wire recorded on open procedures creates their group (backend)**: Recording a `FundWire` on open procedures of one fund creates a fund-payment group of that fund and settles it with the wire, with the values of BAS-115 (owner, 2026-11-21, #712): the group is dated on the wire's date, totals the billed amounts and holds one line per procedure; it is `BankPaid` and locked. Each procedure goes from `Created` to `FundPaid`, paid by bank transfer on the wire's date for its billed amount, its fund reconciliation dated the same day. The wire's amount is the group's total (R3).

**BSM-052 — Its refusals come first for its fields (backend)**: Such a wire is refused as BSM-020 says — its account missing, its date missing or invalid, no procedure selected — every reason in one answer, before any other check (BSM-021).

**BSM-053 — Every selected procedure is open (backend)**: Such a wire whose selection holds a procedure that is not an open procedure of the given fund — unknown, of another fund, not `Created`, already in a group, or with no positive billed amount — is rejected with a specific error naming the first such procedure in the selection's order, before its account is looked up. A missing or unknown fund has no open procedure (BSM-050), so it is refused the same way. A repeated procedure counts once (BSM-028).

**BSM-054 — The group and the wire are one write (backend)**: The group, its lines, the wire, its link and the procedures' changes are written together (BSM-034): a refused or failed recording leaves none of them, and publishes none of `BankEntryUpdated`, `FundPaymentGroupUpdated`, `ProcedureUpdated`.

**BSM-055 — Once recorded, an ordinary wire (backend)**: A wire recorded under BSM-051 settles an ordinary group: it is edited and deleted as any fund's wire (R8 to R11), and deleting it leaves the group `Active` with its procedures `Reconciled` (R1's declared exception).

**BSM-056 — Groups or open procedures, never both (backend)**: A wire is recorded on existing groups (R7) or on open procedures of any one fund (BSM-051): one recorded on open procedures is recorded on the group it creates alone.

### Direct payments

**R13 — Automatic account for a direct payment (backend)**: No account is chosen for a `PatientCash`, `PatientCheck` or `PatientCreditCard` bank entry: BSM-026 places it (owner, 2026-11-07, #518).

**R14 — Procedures of the window (backend)**: The procedures offered first for a direct payment, created or edited, are those in `Created` status whose `procedure_date` is from 7 days before the payment's date to that date, both included. A missing or invalid date is rejected with a specific error.

**BSM-036 — Every selected procedure exists (backend)**: Creating or editing a direct payment whose selection holds a procedure that does not exist is refused, naming the first in the order the selection holds them, even beside procedures that exist. A procedure the entry already holds cannot be deleted (PRO-030B), so a kept one always exists. The field refusals of BSM-021 come first; an edit answered unchanged (BSM-031) is not judged.

**BSM-039 — A direct payment takes `Created` procedures (backend)**: Creating or editing a direct payment whose selection holds a procedure not in `Created` status is refused with a specific error naming the first such procedure in the selection's order, and nothing is written (BSM-034). A procedure the edited entry already holds is kept, paid on the new date (BSM-035). BSM-036's refusal of an unknown procedure comes first (owner, 2026-11-07, #634).

**R15 — Creation: status effects (backend)**: When the payment is recorded, each procedure receives the payment method of the entry's type, its date and its paid amount, and its status moves to `DirectlyPaid`. See the "Affected fields — on payment creation" table.

**R16 — Deletion: rollback (backend)**: Deleting a direct payment reverts its procedures to `Created` status and clears their payment method, date, and paid amount.

**R17 — Edit: editable fields (backend)**: The date of a direct payment and the procedures it holds can be edited. A procedure it adds is one of R20's (BSM-039). The amount is recomputed accordingly.

**R20 — Every `Created` procedure (backend)**: A direct payment, created or edited, can hold any procedure in `Created` status, whatever its date: R14's window only narrows what is offered first, and the whole set can be read instead.

**R18 — Edit: adding a procedure (backend)**: Adding a procedure has the same effects on its statuses and fields as at creation (see R15).

**R19 — Edit: removing a procedure (backend)**: Removing a procedure has the same effects on its statuses and fields as at deletion (see R16).

**Affected fields — on payment creation**

| Entity    | Field                    | Value                                                                                   |
| --------- | ------------------------ | --------------------------------------------------------------------------------------- |
| Procedure | `payment_status`         | `Created` → `DirectlyPaid`                                                              |
| Procedure | `payment_method`         | `Check` / `BankCard` / `Cash`, for `PatientCheck` / `PatientCreditCard` / `PatientCash` |
| Procedure | `confirmed_payment_date` | = payment date                                                                          |
| Procedure | `paid_amount`            | = billed amount                                                                         |

**Affected fields — on payment deletion**

| Entity    | Field                    | Value                      |
| --------- | ------------------------ | -------------------------- |
| Procedure | `payment_status`         | `DirectlyPaid` → `Created` |
| Procedure | `payment_method`         | cleared                    |
| Procedure | `confirmed_payment_date` | cleared                    |
| Procedure | `paid_amount`            | cleared                    |

---

## Workflow

```
[A fund's wire is recorded: account, date, groups]
  → groups → BankPaid, locked; procedures → FundPaid / PartiallyFundPaid (R7)
[It is edited: date, groups]
  → groups removed → Active; groups added → BankPaid; kept ones follow the date (R10, R11, BSM-035)
[It is deleted]
  → groups → Active; procedures → Reconciled / PartiallyReconciled (R8)

[A direct payment is recorded: type, date, procedures]
  → procedures → DirectlyPaid (R15)
[It is edited: date, procedures]
  → procedures removed → Created; procedures added → DirectlyPaid (R18, R19, BSM-035)
[It is deleted]
  → procedures → Created (R16)

[A fund's wire is recorded on open procedures: account, date, fund, procedures]
  → their group is created, BankPaid, locked; procedures → FundPaid (BSM-051)

A refused creation, edit or deletion changes nothing (BSM-034, BSM-040).
```

---

## Open Questions

- [ ] Where does BSM-029's refusal come among those of BSM-036, BSM-037, BSM-037A and BSM-039? Today after an unknown group or procedure.
- [ ] After BSM-038D a wire's amount stands above the sum of its groups (R3): should the repair lower it? Today it does not.
- [ ] A group whose links all point to bank entries that no longer exist loses them all (BSM-038B) and stays `BankPaid` with no bank entry: should it go back to `Active` (R8)? Today it does not.
- [ ] Is the user told which wires the repair unlinked? Today only the log names them; #733 asks for a view of the wires with no group.
- [ ] After BSM-038C, should the procedures' confirmed payment date follow the entry that goes on settling the group (BSM-035)? Today it is left as it is (BSM-038E).
- [ ] A procedure that stops being open between BSM-053's check and the write (BSM-054) is still refused, by the procedure itself, with the error of BSM-039: should BSM-053's error answer instead?
- [ ] In what order are the groups and procedures of R6, R12, R14 and R20 returned? Today the order is not set; the screens sort them.
- [ ] May one fund's wire hold groups of several funds (R9)? Today it may; the import refuses it per line (BAS-090A).
- [ ] Which of `BankEntryUpdated`, `FundPaymentGroupUpdated` and `ProcedureUpdated` does a successful creation, edit or deletion publish? BSM-031, BSM-034 and BSM-040 name them only for what is refused or unchanged.
- [x] Which account does a `PatientCash` creation store (R13)? — Decided by the owner on 2026-10-24
      (#455): the cash account, set by the backend whatever it is sent.
- [x] May a `PatientCheck` or `PatientCreditCard` bank entry be recorded on the cash account? — Decided by
      the owner on 2026-11-07 (#518): each direct type has its own technical account (BAC-056).
