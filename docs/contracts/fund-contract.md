# Contract — Fund

> Domain: fund
> Backend module: context/fund
> Last updated by: retroactive (fund CRUD from no dedicated spec; fund payment group CRUD from fund-payment-manual-match spec)

## Commands

### Fund CRUD

### `add_fund`

Creates a new fund with an identifier and a name.

- **Args:** `fund_identifier: String, fund_name: String`
- **Returns:** `Fund`
- **Errors:** `EmptyIdentifier`, `EmptyName`, `DuplicateIdentifier`

---

### `read_all_funds`

Returns all funds. Used to populate the fund dropdown in the procedure form and the fund filter in various pickers.

- **Args:** —
- **Returns:** `Vec<Fund>`
- **Errors:** —

---

### `update_fund`

Updates an existing fund's identifier and/or name.

- **Args:** `fund: Fund`
- **Returns:** `Fund`
- **Errors:** `FundNotFound`, `EmptyIdentifier`, `EmptyName`, `DuplicateIdentifier`

---

### `delete_fund`

Hard-deletes a fund. Side effect: any patient whose `latest_fund` references this fund has `latest_fund` cleared (POC R22).

- **Args:** `id: String`
- **Returns:** `()`
- **Errors:** `FundNotFound`

---

### `validate_batch_funds`

Validates a list of fund candidates before batch creation. Each candidate is checked for duplicate identifiers. Returns a per-candidate result without persisting anything.

- **Args:** `funds: Vec<FundCandidate>`
- **Returns:** `ValidateBatchFundsResponse`
- **Errors:** —

---

### `create_batch_funds`

Creates a batch of validated fund candidates in a single transaction. Returns created `Fund` records and a `temp_id → real_id` map.

- **Args:** `funds: Vec<FundCandidate>`
- **Returns:** `CreateBatchFundsResponse`
- **Errors:** `BatchCreationFailed`

---

### Fund Payment Group CRUD

### `read_all_fund_payment_groups` — FPM R10

Returns all fund-payment groups with their lines and derived `is_locked` state. `is_locked` is recomputed from the procedures' statuses on every read to guarantee consistency (FPM R10).

- **Args:** —
- **Returns:** `Vec<FundPaymentGroup>`
- **Errors:** —

---

### `create_fund_payment_group` — FPM R3, R4, R5, R8

Creates a fund-payment group with the given procedures. Validates that fund, date, and at least one procedure are provided (FPM R3). Computes `total_amount` as the sum of `procedure_amount` of selected procedures (FPM R4). Each added procedure moves to `Reconciliated`; `confirmed_payment_date` is set to the group payment date; `actual_payment_amount` is set to the procedure amount (FPM R8).

- **Args:** `fund_id: String, payment_date: String, procedure_ids: Vec<String>`
- **Returns:** `FundPaymentGroup`
- **Errors:** `FundNotFound`, `ProcedureNotFound`, `ProcedureNotInCreatedStatus`, `NoProceduresSelected`, `InvalidDateFormat`

---

### `update_fund_payment_group_with_procedures` — FPM R4, R6, R7, R8, R9

Updates the payment date and/or procedure composition of an existing group. Removed procedures revert to `Created` (FPM R7); added procedures move to `Reconciliated` (FPM R8). Total recomputed (FPM R4). Blocked if the group is `BankPayed` (FPM R9).

- **Args:** `group_id: String, payment_date: String, procedure_ids: Vec<String>`
- **Returns:** `FundPaymentGroup`
- **Errors:** `GroupNotFound`, `GroupLocked`, `ProcedureNotFound`, `ProcedureNotInCreatedStatus`, `InvalidDateFormat`

---

### `delete_fund_payment_group` — FPM R9, R11

Hard-deletes the group and resets all linked procedures to `Created`, clearing their `confirmed_payment_date` and `actual_payment_amount`. Blocked if the group is `BankPayed` (FPM R9). Also rejects deletion of refund fund-payment groups created by the overpayment flow (REF-240).

- **Args:** `group_id: String`
- **Returns:** `()`
- **Errors:** `GroupNotFound`, `GroupLocked`, `DeletionForbidden`

---

## Shared Types

```rust
struct Fund {
    id: String,
    fund_identifier: String,
    name: String,
}

// batch import candidate — lacks a real ID
struct FundCandidate {
    temp_id: String,
    fund_identifier: String,
    fund_name: String,
}

struct FundValidationResult {
    candidate: FundCandidate,
    status: FundValidationStatus,
    existing_id: Option<String>,   // populated when status = AlreadyExists
    error: Option<String>,         // populated when status = Invalid
}

enum FundValidationStatus {
    Valid,
    AlreadyExists,
    Invalid,
}

struct ValidateBatchFundsResponse {
    results: Vec<FundValidationResult>,
}

struct CreateBatchFundsResponse {
    funds: Vec<Fund>,
    temp_id_map: Map<String, String>,  // temp_id → real fund ID
}

// FPM R10 — a fund-payment group aggregate
struct FundPaymentGroup {
    id: String,
    fund_id: String,
    payment_date: String,   // ISO date YYYY-MM-DD
    total_amount: i64,      // sum of procedure amounts; recomputed on every change (FPM R4)
    lines: Vec<FundPaymentLine>,
    status: FundPaymentGroupStatus,
    is_locked: bool,        // derived from status; true when BankPayed (FPM R10)
}

struct FundPaymentLine {
    id: String,
    fund_payment_group_id: String,
    procedure_id: String,
}

enum FundPaymentGroupStatus {
    Active,    // editable
    BankPayed, // locked — a bank transfer has been confirmed for this group
}
```

## Events

| Event              | Trigger                                                                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProcedureUpdated` | After `create_fund_payment_group`, `update_fund_payment_group_with_procedures`, `delete_fund_payment_group` — procedure statuses and payment fields change |

## Changelog

- 2026-05-02 — Added retroactively from specta_builder.rs: add_fund, read_all_funds, update_fund, delete_fund, validate_batch_funds, create_batch_funds, read_all_fund_payment_groups, create_fund_payment_group, update_fund_payment_group_with_procedures, delete_fund_payment_group
