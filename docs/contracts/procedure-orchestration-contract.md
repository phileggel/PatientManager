# Contract — Procedure Orchestration

> Domain: procedure-orchestration
> Backend module: use_cases/procedure_orchestration
> Last updated by: procedure-orchestration spec, business rules only (#646)

## Commands

### `read_all_procedures` — PRO-170

Returns all procedures, by procedure date ascending (PRO-170; today unordered, the screen sorts them — #427). PRO-060's statistics and PRO-310's overdue are owed by #427, which sets their shape (owner, 2026-11-14). The screen filters them by period and status.

- **Args:** —
- **Returns:** `Vec<Procedure>`
- **Errors:** —

---

### `add_procedure` — PRO-125, PRO-200, PRO-210, PRO-220, PRO-230, PRO-260

Creates a new procedure. Validates mandatory fields, every missing or malformed one at once (PRO-125, PRO-200) and checks FK existence for `patient_id`, `procedure_type_id`, and optionally `fund_id` (PRO-210). `payment_method` is always `None` at creation via the frontend form (PRO-220). Initial status is always `Created` (PRO-230). Updates patient tracking fields if the new procedure is the most recent (PRO-260).

- **Args:** `patient_id: String, fund_id: String, procedure_type_id: String, procedure_date: String, billed_amount: i64`
- **Returns:** `Procedure`
- **Errors:** `ProcedureInvalid { reasons: Vec<ProcedureInvalidReason> }` (nothing written), `PatientNotFound`, `ProcedureTypeNotFound`, `FundNotFound`

---

### `update_procedure` — PRO-125, PRO-190, PRO-250, PRO-251, PRO-252, PRO-255, PRO-256, REF-170, REF-200

Accepts all procedure fields without re-inference (PRO-250); PRO-190's and REF-200's refusals are not raised yet (#379): `ProcedureEditBlocked` names them. Refuses a missing patient, type or date, or a malformed date, all at once (PRO-125). Values all equal to the stored procedure are answered `Unchanged` and nothing is written (PRO-255). Refusals in order (PRO-256): missing fields (PRO-125), an unknown procedure (PRO-252), a changed `patient_id`, `procedure_type_id` or `fund_id` that does not exist; a kept one stays valid (PRO-251). For procedures in `Overpaid` status, propagates any `procedure_type_id` change to the linked refund procedure atomically (REF-170).

- **Args:** `raw: RawProcedure`
- **Returns:** `ProcedureEdit`
- **Errors:** `ProcedureInvalid { reasons: Vec<ProcedureInvalidReason> }` (nothing written), `PatientNotFound`, `ProcedureTypeNotFound`, `FundNotFound`, `ProcedureNotFound`, `ProcedureEditBlocked` (PRO-190, REF-200; not raised until #379)

---

### `delete_procedure` — PRO-030, PRO-030A–C, PRO-270

Really deletes a procedure after checking it is not in a blocking status (PRO-030A — `Reconciled`, `PartiallyReconciled`, `FundPaid`, `PartiallyFundPaid`, `DirectlyPaid`, `Overpaid`, `OverpaymentRefund`) and that no fund payment line, bank entry or refund record refers to it (PRO-030B); an unknown one is refused (PRO-030C). Updates patient tracking fields after deletion (PRO-270).

- **Args:** `id: String`
- **Returns:** `()`
- **Errors:** `ProcedureNotFound`, `ProcedureDeleteBlocked` (a blocking status, or a record still referring to it), `DatabaseError`

---

### `get_unpaid_procedures_by_fund` — FPM-100, FPM-110

Returns procedures in `Created` status for the given fund. Used to populate the procedure picker in the fund-payment group creation and edit flows (FPM-110 — only procedures from the chosen fund are offered).

- **Args:** `fund_id: String`
- **Returns:** `Vec<Procedure>`
- **Errors:** `FundNotFound`

---

### `read_procedures_by_ids`

Returns procedures by a list of IDs. Used by features that need to resolve procedure details from a known set of IDs (e.g. manual-match edit pre-fill).

- **Args:** `ids: Vec<String>`
- **Returns:** `Vec<Procedure>`
- **Errors:** —

---

## Shared Types

```rust
struct Procedure {
    id: String,
    patient_id: String,
    fund_id: Option<String>,
    procedure_type_id: String,
    procedure_date: String,              // ISO date YYYY-MM-DD
    billed_amount: i64,                  // in thousandths of a euro
    payment_method: PaymentMethod,
    // Stage 1 — fund-declared payment date from the fund document;
    // set by fund-payment-* reconciliation flows when the procedure
    // enters a FundPaymentGroup (FPM-320, FPA-300), cleared on removal
    // (FPM-310, FPM-400).
    fund_reconciliation_date: Option<String>,
    // Stage 2 — bank-side confirmed payment date; set by
    // bank-statement-* reconciliation flows or directly at Excel
    // import (column J) for procedures arriving with payment data
    // already present.
    confirmed_payment_date: Option<String>,
    paid_amount: Option<i64>,
    payment_status: ProcedureStatus,
}

// PRO-250 — raw update input from the frontend (no re-inference)
struct RawProcedure {
    id: String,
    patient_id: String,
    fund_id: Option<String>,
    procedure_type_id: String,
    procedure_date: String,              // as typed, YYYY-MM-DD or empty (PRO-125)
    billed_amount: i64,
    payment_method: Option<String>,      // raw string
    // Typed dates (YYYY-MM-DD): a malformed value is refused when the
    // command's arguments are read, before it runs; an edit sends them back as read (PRO-250).
    fund_reconciliation_date: Option<String>,
    confirmed_payment_date: Option<String>,
    paid_amount: Option<i64>,
    // As the screen read it; an unknown status is refused when the
    // command's arguments are read, before it runs (TODO-030).
    payment_status: ProcedureStatus,
}

// PRO-255 — what an edit from the form did; on the wire
// { outcome: "Updated", procedure } or { outcome: "Unchanged" }
enum ProcedureEdit {
    Updated { procedure: Procedure },
    Unchanged,                           // values equal the stored ones, nothing written
}

// PRO-125 — one per refused field, all answered at once
enum ProcedureInvalidReason {
    PatientIdEmpty,
    ProcedureTypeIdEmpty,
    ProcedureDateEmpty,
    ProcedureDateInvalid,
}

enum ProcedureStatus {
    None,
    Created,
    Reconciled,
    PartiallyReconciled,
    FundPaid,
    PartiallyFundPaid,
    DirectlyPaid,
    ImportDirectlyPaid,
    ImportFundPaid,
    Overpaid,
    OverpaymentRefund,
}

enum PaymentMethod {
    None,
    Cash,
    Check,
    BankCard,
    BankTransfer,
}

```

## Events

| Event              | Trigger                                                                          |
| ------------------ | -------------------------------------------------------------------------------- |
| `ProcedureUpdated` | After `add_procedure`, `update_procedure` answered `Updated`, `delete_procedure` |

## Changelog

- 2026-10-18 — Modified by `procedure-orchestration` spec (TODO-026): `add_procedure`, `update_procedure` (PRO-125, PRO-251, PRO-252, PRO-255, PRO-256)
- 2026-10-18 — Modified by `procedure-orchestration` spec (TODO-030): `update_procedure` — `RawProcedure.payment_status` typed `ProcedureStatus` (PRO-250)
- 2026-11-07 — `delete_procedure` (#588, PRO-030): a procedure is really deleted; one a payment record still refers to is refused with `ProcedureDeleteBlocked`. The error was misnamed `DeletionBlocked` here.
- 2026-11-08 — `delete_procedure`: `DatabaseError` listed again (release sweep).
- 2026-11-14 — #646: the spec holds business rules only; references follow (PRO-170, PRO-190, PRO-030A–C). No signature, type or error change.
