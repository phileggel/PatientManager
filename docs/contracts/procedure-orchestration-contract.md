# Contract — Procedure Orchestration

> Domain: procedure-orchestration
> Backend module: use_cases/procedure_orchestration
> Last updated by: procedure-orchestration spec

## Commands

### `read_all_procedures` — PRO-010 (implicit listing)

Returns all procedures. Period (PRO-010) and status (PRO-180) filters are applied client-side by the frontend.

- **Args:** —
- **Returns:** `Vec<Procedure>`
- **Errors:** —

---

### `add_procedure` — PRO-200, PRO-210, PRO-220, PRO-230, PRO-260

Creates a new procedure. Validates mandatory fields (PRO-200) and checks FK existence for `patient_id`, `procedure_type_id`, and optionally `fund_id` (PRO-210). `payment_method` is always `None` at creation via the frontend form (PRO-220). Initial status is always `Created` (PRO-230). Updates patient tracking fields if the new procedure is the most recent (PRO-260).

- **Args:** `patient_id: String, fund_id: String, procedure_type_id: String, procedure_date: String, billed_amount: i64`
- **Returns:** `Procedure`
- **Errors:** `PatientNotFound`, `ProcedureTypeNotFound`, `FundNotFound`, `InvalidDateFormat`, `MissingRequiredField`

---

### `update_procedure` — PRO-250, REF-170

Accepts all procedure fields without re-inference (PRO-250). No FK validation — the frontend is responsible for the values sent. For procedures in `Overpaid` status, propagates any `procedure_type_id` change to the linked refund procedure atomically (REF-170).

- **Args:** `raw: RawProcedure`
- **Returns:** `Procedure`
- **Errors:** `ProcedureNotFound`, `InvalidDateFormat`

---

### `delete_procedure` — PRO-030, PRO-270

Deletes a procedure after checking it is not in a blocking status (PRO-030 — `Reconciliated`, `PartiallyReconciled`, `FundPayed`, `PartiallyFundPayed`, `DirectlyPayed`, `Overpaid`, `OverpaymentRefund`). Updates patient tracking fields after deletion (PRO-270).

- **Args:** `id: String`
- **Returns:** `()`
- **Errors:** `ProcedureNotFound`, `DeletionBlocked`

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

### `validate_batch_procedures`

Validates a list of procedure candidates before batch creation. Returns a per-candidate result without persisting anything. Used by the excel import flow.

- **Args:** `procedures: Vec<ProcedureCandidate>`
- **Returns:** `ValidateBatchProceduresResponse`
- **Errors:** —

---

### `create_batch_procedures` — PRO-300

Creates a batch of procedures in a single transaction, emitting exactly one `ProcedureUpdated` event (PRO-300). Returns the created `Procedure` records. Used by the excel import flow.

- **Args:** `procedures: Vec<ProcedureCandidate>`
- **Returns:** `CreateBatchProceduresResponse`
- **Errors:** `BatchCreationFailed`

---

## Shared Types

```rust
struct Procedure {
    id: String,
    patient_id: String,
    fund_id: Option<String>,
    procedure_type_id: String,
    procedure_date: String,              // ISO date YYYY-MM-DD
    billed_amount: Option<i64>,          // in thousandths of a euro
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
    procedure_date: String,
    billed_amount: Option<i64>,
    payment_method: Option<String>,      // raw string
    fund_reconciliation_date: Option<String>,
    confirmed_payment_date: Option<String>,
    paid_amount: Option<i64>,
    payment_status: String,              // raw string
}

// batch import candidate
struct ProcedureCandidate {
    patient_id: String,
    fund_id: Option<String>,
    procedure_type_id: String,
    procedure_date: String,
    billed_amount: Option<i64>,
    payment_method: Option<String>,
    confirmed_payment_date: Option<String>,
    paid_amount: Option<i64>,
    awaited_amount: Option<i64>,         // ignored at persistence (PRO-240)
}

enum ProcedureStatus {
    None,
    Created,
    Reconciliated,
    PartiallyReconciled,
    FundPayed,
    PartiallyFundPayed,
    DirectlyPayed,
    ImportDirectlyPayed,
    ImportFundPayed,
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

struct ProcedureValidationResult {
    candidate: ProcedureCandidate,
    status: ProcedureValidationStatus,
    error: Option<String>,
}

enum ProcedureValidationStatus {
    Valid,
    Invalid,
}

struct ValidateBatchProceduresResponse {
    results: Vec<ProcedureValidationResult>,
}

struct CreateBatchProceduresResponse {
    procedures: Vec<Procedure>,
}
```

## Events

| Event              | Trigger                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `ProcedureUpdated` | After `add_procedure`, `update_procedure`, `delete_procedure`, `create_batch_procedures` |

## Changelog

- 2026-05-02 — Added by `procedure-orchestration` spec + retroactive from specta_builder.rs: read_all_procedures, add_procedure, update_procedure, delete_procedure, get_unpaid_procedures_by_fund, read_procedures_by_ids, validate_batch_procedures, create_batch_procedures
