# Contract — Procedure Orchestration

> Domain: procedure-orchestration
> Backend module: use_cases/procedure_orchestration
> Last updated by: procedure-orchestration spec

## Commands

### `read_all_procedures` — R1 (implicit listing)

Returns all procedures. Period (R1) and status (R25) filters are applied client-side by the frontend.

- **Args:** —
- **Returns:** `Vec<Procedure>`
- **Errors:** —

---

### `add_procedure` — R13, R14, R15, R16, R19

Creates a new procedure. Validates mandatory fields (R13) and checks FK existence for `patient_id`, `procedure_type_id`, and optionally `fund_id` (R14). `payment_method` is always `None` at creation via the frontend form (R15). Initial status is always `Created` (R16). Updates patient tracking fields if the new procedure is the most recent (R19).

- **Args:** `patient_id: String, fund_id: String, procedure_type_id: String, procedure_date: String, billed_amount: i64`
- **Returns:** `Procedure`
- **Errors:** `PatientNotFound`, `ProcedureTypeNotFound`, `FundNotFound`, `InvalidDateFormat`, `MissingRequiredField`

---

### `update_procedure` — R18, REF-170

Accepts all procedure fields without re-inference (R18). No FK validation — the frontend is responsible for the values sent. For procedures in `Overpaid` status, propagates any `procedure_type_id` change to the linked refund procedure atomically (REF-170).

- **Args:** `raw: RawProcedure`
- **Returns:** `Procedure`
- **Errors:** `ProcedureNotFound`, `InvalidDateFormat`

---

### `delete_procedure` — R5, R20

Deletes a procedure after checking it is not in a blocking status (R5 — `Reconciliated`, `PartiallyReconciled`, `FundPayed`, `PartiallyFundPayed`, `DirectlyPayed`, `Overpaid`, `OverpaymentRefund`). Updates patient tracking fields after deletion (R20).

- **Args:** `id: String`
- **Returns:** `()`
- **Errors:** `ProcedureNotFound`, `DeletionBlocked`

---

### `get_unpaid_procedures_by_fund` — FPM R1, R2

Returns procedures in `Created` status for the given fund. Used to populate the procedure picker in the fund-payment group creation and edit flows (FPM R2 — only procedures from the chosen fund are offered).

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

### `create_batch_procedures` — R23

Creates a batch of procedures in a single transaction, emitting exactly one `ProcedureUpdated` event (R23). Returns the created `Procedure` records. Used by the excel import flow.

- **Args:** `procedures: Vec<ProcedureCandidate>`
- **Returns:** `CreateBatchProceduresResponse`
- **Errors:** `BatchCreationFailed`

---

## Shared Types

```rust
struct Procedure {
    id: String,
    patient_id: String,
    fund_id: String,                     // optional
    procedure_type_id: String,
    procedure_date: String,              // ISO date YYYY-MM-DD
    billed_amount: i64,                  // optional; in thousandths of a euro
    payment_method: PaymentMethod,
    confirmed_payment_date: String,      // optional
    paid_amount: i64,                    // optional
    payment_status: ProcedureStatus,
}

// R18 — raw update input from the frontend (no re-inference)
struct RawProcedure {
    id: String,
    patient_id: String,
    fund_id: String,                     // optional
    procedure_type_id: String,
    procedure_date: String,
    billed_amount: i64,                  // optional
    payment_method: String,              // optional; raw string
    confirmed_payment_date: String,      // optional
    paid_amount: i64,                    // optional
    payment_status: String,              // raw string
}

// batch import candidate
struct ProcedureCandidate {
    patient_id: String,
    fund_id: String,                     // optional
    procedure_type_id: String,
    procedure_date: String,
    billed_amount: i64,                  // optional
    payment_method: String,              // optional
    confirmed_payment_date: String,      // optional
    paid_amount: i64,                    // optional
    awaited_amount: i64,                 // optional; ignored at persistence (R17)
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
    error: String,   // optional
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
