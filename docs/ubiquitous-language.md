# Ubiquitous Language

The authoritative dictionary of domain terms for this project.

**Rules:**

- All terms MUST be agreed with the user before use in code, tests, or docs.
- The agent MUST NOT invent or assume domain terms — propose and wait for confirmation.
- Terms marked `pending` are proposals awaiting user validation.
- Once confirmed, the term MUST be used consistently everywhere (code, comments, specs, UI).

---

## Patient Context

### Patient

The aggregate root of the patient context. Represents an individual receiving healthcare
procedures. May be anonymous (no name/SSN) or identified. Tracks the most recent procedure
defaults (type, fund, date, amount) to pre-populate new procedure forms. The SSN is shown on
screen as « INS ».

> Status: confirmed

---

### Record (« Fiche »)

The screen word for one patient where two are shown side by side: « Fiche 1 », « Fiche 2 » on the
patient duplicates page. A word of the interface only; code and specs say patient.

> Status: confirmed

### Candidate pair (« Doublon »)

Two patients, neither deleted nor anonymous, that carry the same name once spaces, case and
accents are ignored, and that the user has not dismissed. Proposed on the patient duplicates page.

> Status: confirmed

### Merge (« Fusionner »)

Making one patient of a candidate pair: the **kept patient** receives every procedure of the
other, which is deleted. Not reversible from the app.

> Status: confirmed

### Duplicate dismissal (« Pas un doublon »)

The user's statement that the two patients of a pair are different people. The pair is not
proposed again. Owned by the patient context; removed only with one of its patients.

> Status: confirmed

---

## Fund Context

### Fund

The aggregate root of the fund context. Represents a health insurance body (_caisse_, e.g.
CPAM or mutuelle) that reimburses procedures on behalf of patients. Identified by a business
code (`fund_identifier`) and a human-readable name.

> Status: confirmed
> ⚠️ Code discrepancy: currently named `AffiliatedFund` in `context/fund/domain.rs` — to be renamed to `Fund`.

### FundPayment

The true domain aggregate root for fund reimbursement. Represents the monthly reimbursement
document summarising all payments received from all funds for a given month. Contains one or
more `FundPaymentGroup`s.

> Status: confirmed
> ⚠️ Code discrepancy: does not exist yet in code. Currently `FundPaymentGroup` acts as the
> top-level object. Introducing `FundPayment` as the aggregate root is a future migration step.

### FundPaymentGroup

An internal entity of `FundPayment`. An artificial but necessary subdivision grouping all
payments from a single `Fund` on a specific date within a `FundPayment`. Contains one or
more `FundPaymentLine`s. Transitions from `Active` to `BankPaid` once the corresponding
bank transfer is matched.

> Status: confirmed
> ⚠️ Code discrepancy: currently modelled as an independent aggregate root with its own
> repository. Should become an internal entity of `FundPayment`.

### GroupOrigin

Where a `FundPaymentGroup` comes from, set once at its creation and never changed:
`Payment` — a group of money the fund paid; `Refund` — the group the refund cascade creates
(REF-100), removed only by cancelling the refund (REF-210, REF-240).

> Status: confirmed (owner, 2026-10-18)

### FundPaymentLine

An internal entity of `FundPaymentGroup`. Links the group to a specific procedure.
External code MUST NOT construct or mutate it directly.

> Status: confirmed

### FundPaymentGroupStatus

Lifecycle status of a `FundPaymentGroup`.

- `Active` — created, not yet bank-reconciled; can be edited or deleted.
- `BankPaid` — matched to a bank transfer; locked, cannot be edited or deleted.
  > Status: confirmed
  > ⚠️ Code discrepancy: currently spelled `BankPayed` in code — to be corrected to `BankPaid`.

### FundPaymentStatus _(future)_

A derived status on `FundPayment` that globalises the state of all its groups — e.g. fully
settled once every `FundPaymentGroup` reaches `BankPaid`. Vocabulary and states to be defined
if and when this is needed.

> Status: future improvement — not to be implemented until explicitly requested.

---

## Procedure Context

### Procedure

The aggregate root of the procedure context. Represents a single healthcare procedure
(service rendered) for one patient, with financial tracking:

- `billed_amount` — what was invoiced to the fund or patient.
- `paid_amount` — what was actually received (from fund or patient); may differ from `billed_amount`.
- `payment_method`, `confirmed_payment_date`, `payment_status` — payment and reconciliation state.
  > Status: confirmed

### Open procedure

A procedure eligible for direct settlement from the bank reconciliation (`bank-statement-auto-match` BAS-112): its fund is known, its `payment_status` is `Created`, it belongs to no active fund-payment-group line, and it carries a positive `billed_amount`. Used by the bank-born-group flow (BAS-115) for funds that never issue a bordereau.

> Status: confirmed (2026-07-31)

### ProcedureType

An aggregate root in the procedure context. Represents a category of healthcare service
(e.g. consultation, act code) with a name, optional free-text category label, and a default
amount used to pre-populate new procedures.

> Status: confirmed

### ProcedureRefund

An internal entity of the procedure context. Records the full audit trail of an overpayment
refund: the source procedure, the negative-amount refund procedure, and the IDs of the
associated fund payment group and bank transfer (opaque cross-context references — no domain
types are imported from those contexts). Immutable once created.

> Status: confirmed

### ProcedureStatus

Lifecycle/reconciliation status of a `Procedure`.

- `None` — initial state, no payment activity.
- `Created` — procedure created, awaiting reconciliation.
- `Reconciled` — associated with a fund payment group, awaiting bank confirmation.
- `PartiallyReconciled` — fund payment group associated but actual amount ≠ invoiced amount.
- `DirectlyPaid` — paid directly (cash/card) by the patient, no fund reconciliation.
- `FundPaid` — bank transfer confirmed for a fully reconciled procedure.
- `PartiallyFundPaid` — bank transfer confirmed for a partially reconciled procedure.
- `ImportDirectlyPaid` — imported from Excel as directly paid (ES/CH); non-blocking re-import.
- `ImportFundPaid` — imported from Excel with a fund; non-blocking re-import.
- `Overpaid` — source procedure whose overpayment has been fully recorded.
- `OverpaymentRefund` — mirror negative procedure created to offset an overpayment.
  > Status: confirmed
  > ⚠️ Code discrepancy: the variants and the wire use these names (`RECONCILED`, `FUND_PAID`, …);
  > the database still stores `RECONCILIATED`, `DIRECTLY_PAYED`, `FUND_PAYED`, `PARTIALLY_FUND_PAYED`,
  > `IMPORT_DIRECTLY_PAYED`, `IMPORT_FUND_PAYED` (`as_db_str` / `FromStr`), so a wire string is never
  > parsed with `FromStr` (TODO-030).

### Overdue (derived)

A **derived**, frontend-only display attribute on a `Procedure` — **not** a `ProcedureStatus` value and never persisted. A `Created` procedure is _overdue_ when its `procedure_date` is strictly earlier than the **reconciliation high-water mark**: the most recent `procedure_date` among all fund-reconciled procedures (`Reconciled` / `PartiallyReconciled` / `FundPaid` / `PartiallyFundPaid` / `ImportFundPaid`). Global (no patient/fund scope), recomputed live, and surfaced only as a warning row background in the procedure list (PRO-310 / PRO-320). An overdue procedure behaves exactly like `Created` for every backend purpose.

> Status: confirmed
> Derived display concept, deliberately not a status — see the pending `ProcedureStatus` de-conflation note in `docs/todo.md`.

### PaymentMethod

How a procedure's payment was made. Shared between regular and refund procedures.

- `None` — no payment information.
- `Cash` — electronic payment (ES code in Excel imports).
- `Check` — cheque payment (CH code in Excel imports).
- `BankCard` — credit/debit card.
- `BankTransfer` — bank transfer (inferred when `confirmed_payment_date` is set without
  an explicit Cash/Check method; also used for outgoing wire refunds).
  > Status: confirmed

---

## Bank Context

### BankAccount

The aggregate root of the bank context. Represents a bank account belonging to the practice,
identified by a name and optional IBAN.

> Status: confirmed

### BankEntry

An aggregate root in the bank context. Represents a single line from a bank statement —
either an incoming fund payment or a direct patient payment, or an outgoing overpayment
refund wire.

> Status: confirmed
> ⚠️ Code discrepancy: currently named `BankTransfer` in `context/bank/domain/` — to be renamed.

### BankEntryType

The nature of a `BankEntry`. Encodes both the payment instrument and its source/destination.

- `FundWire` — incoming wire from a fund.
- `PatientCheck` — cheque deposit from a patient.
- `PatientCreditCard` — card payment from a patient.
- `PatientCash` — cash deposit from a patient.
- `FundOutgoingWire` — outgoing wire for an overpayment refund (REF-080). Only created via
  the overpayment flow; MUST NOT be accepted in the manual-match UI.
  > Status: confirmed
  > ⚠️ Code discrepancy: currently named `BankTransferType` with variants `Fund`, `Check`,
  > `CreditCard`, `Cash`, `OutgoingWire` — to be renamed.

### Left-aside line (« Laissée de côté »)

A bank-statement line consciously excluded from settlement during reconciliation: fund known, zero settlement items assigned, whole amount acknowledged as untracked remainder (BAS-123). Resolved (engine status `matched`) with a distinct badge; session-only — nothing is persisted for it at validate, and re-importing would surface it again. Not a stored concept.

> Status: confirmed (2026-08-03)

### Group left out of the import (« Groupe non importé »)

A group of a fund's PDF statement whose stated total is zero or negative — the fund takes money back — and which the statement import therefore leaves out before matching (FPA-070): none of its lines is matched, nothing is created for it, and it is named to the user. Not a stored concept. Distinct from a left-aside line, which the user sets aside on purpose during a bank reconciliation.

> Status: confirmed (2026-10-11)

### Split into procedures (« Répartir en plusieurs actes »)

The correction of a fund PDF line with no matching procedure that creates one procedure per part instead of one for the whole line (FPA-255 to FPA-258): `SplitIntoProcedures` in code. A part (`SplitPart`) is one procedure's date and amount; the parts add up to the line's amount and their dates fall within the line's period. Not a stored concept: the procedures it creates are.

> Status: confirmed (2026-10-18)

### Bank statement label (« Libellé de relevé »)

The label of a bank statement line, remembered per bank account together with its assignment: a fund, or ignored (« rejected » in BAS-030–035 — same value). Saved by the import flow at validate (BAS-035) and reviewed from the management screen (BAS-041–046). Deleting the bank account deletes its labels.

> ⚠️ Code discrepancy: `BankFundLabelMapping` (table `bank_fund_label_mapping`) — keep the code name; use this term in specs, screens and new prose.
> Status: confirmed (2026-09-29)

### Diagnostic report (« Rapport de diagnostic »)

A text file the user saves from the database backup dialog and sends to support: the state of the installation (version, migrations, database checks, row counts, backend log lines) and no practice data (DGR-020 to DGR-026).

> Status: confirmed (2026-10-03)

### Support code (« Code support »)

The eight-character code (`XXXX-XXXX`) written in a diagnostic report and shown to the user once it is saved, so a report can be matched to the person quoting it (DGR-020).

> Status: confirmed (2026-10-03)

### BankStatementReconciliation

The in-progress, ephemeral reconciliation of one imported bank statement: the set of
bank-statement lines, each carrying a match status plus any pending corrections. Computed
by the backend as a pure function of the parsed statement and an ordered list of corrections
(never persisted), and re-computed on every correction or revert. Posted to the backend on
validate, which commits the resolved lines into `BankEntry` records.

> Status: confirmed

---

## Domain Actions

What happens to an aggregate, in the owner's words. Method names are built from these words
(B11) and are not validated on their own (B5).

### Procedure

- **Reconcile** — link to a fund payment group (→ `Reconciled` / `PartiallyReconciled`);
  **unreconcile** removes it and wipes the reconciliation data (→ `Created`).
- **Dispute** — record that the fund paid less than billed (→ `PartiallyReconciled`).
- **Record a payment** — a bank confirmation or a direct patient payment (→ `FundPaid` /
  `DirectlyPaid`); **revert** it undoes the bank confirmation and restores the group's payment
  date; **clear** it undoes a direct patient payment and wipes the payment fields (→ `Created`).
- **Correct** — override the billed amount, the fund, the date, or a patient's SSN from the PDF
  auto-correction; the PDF is authoritative.

### Fund payment group

- **Confirm the bank payment** — a bank transfer matched: the group is settled, no edit nor
  deletion (→ `BankPaid`); **revert** it when the transfer is removed (→ `Active`).
- **Refund** — a refund to a patient: the group is created settled, its total the amount taken
  back, its one line the refund procedure (owner, 2026-10-17).

### Any aggregate

- **Edit** — a user changing an aggregate's fields from its edit form (owner, 2026-10-05).
  Another kind of change (a PDF override, a status transition) takes its own word. An edit is
  answered `Updated` (saved) or `Unchanged` (its values equal the stored ones, nothing saved)
  (owner, 2026-10-18).

---

## Domain Events

| Name                      | Raised by    | Intent                                              | Status    |
| ------------------------- | ------------ | --------------------------------------------------- | --------- |
| `PatientUpdated`          | Patient BC   | Any state change in the patient context             | confirmed |
| `FundUpdated`             | Fund BC      | Any state change on a Fund                          | confirmed |
| `FundPaymentGroupUpdated` | Fund BC      | Any state change in a FundPaymentGroup or its lines | confirmed |
| `ProcedureUpdated`        | Procedure BC | Any state change in a Procedure                     | confirmed |
| `ProcedureTypeUpdated`    | Procedure BC | Any state change in a ProcedureType                 | confirmed |
| `BankAccountUpdated`      | Bank BC      | Any state change in a BankAccount                   | confirmed |
| `BankEntryUpdated`        | Bank BC      | Any state change in a BankEntry                     | confirmed |
