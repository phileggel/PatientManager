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
defaults (type, fund, date, amount) to pre-populate new procedure forms.

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
  > ⚠️ Code discrepancy: `billed_amount` is named `procedure_amount` in code;
  > `paid_amount` is named `actual_payment_amount` — both to be renamed.

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
  > ⚠️ Code discrepancy: `Reconciliated`, `DirectlyPayed`, `FundPayed`, `PartiallyFundPayed`,
  > `ImportDirectlyPayed`, `ImportFundPayed` in code — to be corrected to `Reconciled`,
  > `DirectlyPaid`, `FundPaid`, `PartiallyFundPaid`, `ImportDirectlyPaid`, `ImportFundPaid`.

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

---

## Aggregate Root Methods

Methods on aggregate roots use domain/business vocabulary (B28). Current names are extracted
from code and proposed for confirmation.

### Procedure

| Method                                      | Domain intent                                              | Status transition                      | Status    |
| ------------------------------------------- | ---------------------------------------------------------- | -------------------------------------- | --------- |
| `reconcile(paid_amount, payment_date)`      | Link to a fund payment group                               | → `Reconciled` / `PartiallyReconciled` | confirmed |
| `unreconcile()`                             | Remove from a fund payment group, wipe reconciliation data | → `Created`                            | confirmed |
| `dispute(paid_amount)`                      | Record that the fund paid less than billed                 | → `PartiallyReconciled`                | confirmed |
| `record_payment(method, date, paid_amount)` | Record bank confirmation or direct patient payment         | → `FundPaid` / `DirectlyPaid`          | confirmed |
| `revert_payment(group_payment_date)`        | Undo bank confirmation, restore group payment date         | → `Reconciled` / `PartiallyReconciled` | confirmed |
| `clear_payment()`                           | Undo direct patient payment, wipe all payment fields       | → `Created`                            | confirmed |
| `correct_billed_amount(billed_amount)`      | Override billed amount from PDF auto-correction            | —                                      | confirmed |
| `correct_fund(fund_id)`                     | Override fund from PDF auto-correction                     | —                                      | confirmed |
| `correct_date(pdf_date)`                    | Override procedure date from PDF auto-correction           | —                                      | confirmed |

> ⚠️ Code discrepancy: none of these aggregate root methods exist yet — fields are mutated
> directly in use case orchestrators. All to be extracted.
> ⚠️ Bug: auto-reconciliation flow (fund_payment_reconciliation/orchestrator.rs:179, :297, :452)
> does not set `confirmed_payment_date` on procedures — date is available but not passed through.

### Patient

| Method             | Domain intent                                                | Status transition | Status    |
| ------------------ | ------------------------------------------------------------ | ----------------- | --------- |
| `correct_ssn(ssn)` | Override SSN from PDF auto-correction (PDF is authoritative) | —                 | confirmed |

> ⚠️ Code discrepancy: `patient.ssn = Some(pdf_ssn)` mutated directly in
> `use_cases/fund_payment_reconciliation/orchestrator.rs:1103`.

### FundPaymentGroup

| Method                                | Domain intent                                                                                                         | Status transition | Status    |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------- | --------- |
| `confirm_bank_payment()`              | Bank transfer matched — group is now settled; prevents edits and deletion                                             | → `BankPaid`      | confirmed |
| `revert_bank_payment()`               | Bank transfer removed — group is back to active                                                                       | → `Active`        | confirmed |
| `update(payment_date, procedure_ids)` | Edit the group — changes payment date and procedure lines; `total_amount` is recalculated internally as a side effect | —                 | confirmed |

> ⚠️ Code discrepancy: `confirm_bank_payment`/`revert_bank_payment` are done via
> `FundPaymentService::update_group_status()` directly to repository. `update()` is a direct
> field mutation in `FundService::update_group()` — to be extracted to the aggregate root.

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
