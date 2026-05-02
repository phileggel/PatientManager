# Contract — Bank Statement Manual Match

> Domain: bank-statement-manual-match
> Last updated by: bank-statement-manual-match spec

## Commands

> `get_cash_bank_account_id` is owned by `context/bank` — see bank-contract.md.

### `get_unsettled_fund_groups` — R6

Returns fund-payment groups not yet reconciled at the bank level whose payment date falls within 7 days preceding `transfer_date`. Populates the initial group selection UI.

- **Args:** `transfer_date: String`
- **Returns:** `Vec<FundGroupCandidate>`
- **Errors:** `InvalidDateFormat`

---

### `get_all_unsettled_fund_groups` — R12

Returns all fund-payment groups not yet reconciled at the bank level, no date constraint. Used for the "Broaden search" modal.

- **Args:** —
- **Returns:** `Vec<FundGroupCandidate>`
- **Errors:** —

---

### `get_fund_groups_by_ids` — R21

Returns `FundGroupCandidate` details for a given set of IDs. Used in the FUND-transfer edit modal to display currently linked groups (in `BankPaid` status) as pre-selected items.

- **Args:** `group_ids: Vec<String>`
- **Returns:** `Vec<FundGroupCandidate>`
- **Errors:** `GroupNotFound`

---

### `create_fund_transfer` — R6, R7

Creates a `FUND` bank entry linked to the given group IDs. On success: procedures move `Reconciliated` → `FundPayed` / `PartiallyReconciled` → `PartiallyFundPayed`; groups move to `BankPayed` and become locked; procedures' `confirmed_payment_date` is set to the transfer date and `payment_method` to `BankTransfer`.

- **Args:** `bank_account_id: String, transfer_date: String, group_ids: Vec<String>`
- **Returns:** `BankManualMatchResult`
- **Errors:** `AccountNotFound`, `GroupNotFound`, `GroupAlreadyReconciled`, `InvalidDateFormat`

---

### `update_fund_transfer` — R9, R10, R11

Updates the date and/or group composition of an existing FUND transfer. Newly added groups receive the same status effects as creation (R10 → R7); removed groups are rolled back as in deletion (R11 → R8). Amount recomputed from the final group set.

- **Args:** `transfer_id: String, new_transfer_date: String, new_group_ids: Vec<String>`
- **Returns:** `BankManualMatchResult`
- **Errors:** `TransferNotFound`, `GroupNotFound`, `GroupAlreadyReconciled`, `InvalidDateFormat`

---

### `delete_fund_transfer` — R5, R8

Hard-deletes a FUND transfer and rolls back all linked groups: procedures revert `FundPayed` → `Reconciliated` / `PartiallyFundPayed` → `PartiallyReconciled`; groups return to `Active` and unlock; procedures' `confirmed_payment_date` is restored to the group payment date and `payment_method` is cleared.

- **Args:** `transfer_id: String`
- **Returns:** `()`
- **Errors:** `TransferNotFound`

---

### `get_transfer_fund_group_ids` — R21

Returns the IDs of groups currently linked to a FUND transfer. Used alongside `get_fund_groups_by_ids` to pre-populate the edit modal.

- **Args:** `transfer_id: String`
- **Returns:** `Vec<String>`
- **Errors:** `TransferNotFound`

---

### `get_eligible_procedures_for_direct_payment` — R14

Returns procedures in `Created` status whose `procedure_date` is within 7 days preceding `payment_date`. Populates the initial procedure selection UI for direct payments.

- **Args:** `payment_date: String`
- **Returns:** `Vec<DirectPaymentProcedureCandidate>`
- **Errors:** `InvalidDateFormat`

---

### `get_all_eligible_procedures_for_direct_payment` — R20

Returns all procedures in `Created` status with no date constraint. Used for the "Broaden search" modal in the direct payment UI.

- **Args:** —
- **Returns:** `Vec<DirectPaymentProcedureCandidate>`
- **Errors:** —

---

### `get_procedures_by_ids` — R21

Returns `DirectPaymentProcedureCandidate` details for a given set of IDs. Used in the direct-payment edit modal to display currently linked procedures (in `DirectlyPaid` status) as pre-selected items.

- **Args:** `procedure_ids: Vec<String>`
- **Returns:** `Vec<DirectPaymentProcedureCandidate>`
- **Errors:** `ProcedureNotFound`

---

### `create_direct_transfer` — R13, R14, R15

Creates a direct payment bank entry (`PATIENT_CHECK`, `PATIENT_CREDIT_CARD`, or `PATIENT_CASH`) linked to the given procedure IDs. For `PATIENT_CASH`, the backend enforces `bank_account_id = cash-account-default` (R13). On success: each procedure moves to `DirectlyPayed`; `payment_method`, `confirmed_payment_date`, and `actual_payment_amount` are set according to the type mapping in `BankEntryType`.

> R2: `OutgoingWire` and `FundWire` are rejected — `InvalidTransferType` is returned.

- **Args:** `bank_account_id: String, transfer_date: String, transfer_type: BankEntryType, procedure_ids: Vec<String>`
- **Returns:** `BankManualMatchResult`
- **Errors:** `AccountNotFound`, `ProcedureNotFound`, `ProcedureNotInCreatedStatus`, `InvalidTransferType`, `CashAccountMismatch`, `InvalidDateFormat`

---

### `update_direct_transfer` — R17, R18, R19

Updates the date and/or procedure composition of an existing direct payment. Newly added procedures receive the same effects as creation (R18); removed procedures are rolled back as in deletion (R19). Amount recomputed.

- **Args:** `transfer_id: String, new_transfer_date: String, new_procedure_ids: Vec<String>`
- **Returns:** `BankManualMatchResult`
- **Errors:** `TransferNotFound`, `ProcedureNotFound`, `ProcedureNotInCreatedStatus`, `InvalidDateFormat`

---

### `delete_direct_transfer` — R5, R16

Hard-deletes a direct payment and rolls back all linked procedures to `Created` status, clearing `payment_method`, `confirmed_payment_date`, and `actual_payment_amount`.

- **Args:** `transfer_id: String`
- **Returns:** `()`
- **Errors:** `TransferNotFound`

---

### `get_transfer_procedure_ids` — R21

Returns the IDs of procedures currently linked to a direct payment. Used alongside `get_procedures_by_ids` to pre-populate the edit modal.

- **Args:** `transfer_id: String`
- **Returns:** `Vec<String>`
- **Errors:** `TransferNotFound`

---

## Shared Types

```rust
// BankEntry and BankAccount are defined in bank-contract.md (context/bank)

// R2 — transfer/payment type; governs which flow applies and what payment_method is set on procedures
enum BankEntryType {
    FundWire,           // FUND transfer — procedures receive payment_method = BankTransfer
    PatientCheck,       // direct payment — procedures receive payment_method = Check
    PatientCreditCard,  // direct payment — procedures receive payment_method = BankCard
    PatientCash,        // direct payment — auto-assigns the cash account (R13); payment_method = Cash
    OutgoingWire,       // reserved for overpayment refund (REF-080); not creatable in this flow (R2)
}

// R6, R12, R21 — a fund-payment group eligible for a FUND bank transfer
struct FundGroupCandidate {
    group_id: String,
    fund_id: String,
    payment_date: String,   // ISO date YYYY-MM-DD
    total_amount: i64,      // group total in thousandths of a euro
}

// R14, R20, R21 — a procedure eligible for a direct payment
struct DirectPaymentProcedureCandidate {
    procedure_id: String,
    patient_id: String,
    procedure_date: String,  // ISO date YYYY-MM-DD
    billed_amount: i64,      // optional; absent if not yet set
}

// R7, R10, R11, R15, R18, R19 — result of a create/update operation with linked items
struct BankManualMatchResult {
    transfer_id: String,
    linked_count: u32,  // number of groups or procedures linked after the operation
}
```

## Events

| Event              | Trigger                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `ProcedureUpdated` | After create/update/delete of either transfer type — procedure status or payment fields changed |
| `FundGroupUpdated` | After create/update/delete of a FUND transfer — group status or lock state changed              |
| `BankEntryUpdated` | After any write operation — `BankEntry` records created or removed                              |

## Changelog

- 2026-05-02 — Added by `bank-statement-manual-match` spec: get_cash_bank_account_id, get_unsettled_fund_groups, get_all_unsettled_fund_groups, get_fund_groups_by_ids, create_fund_transfer, update_fund_transfer, delete_fund_transfer, get_transfer_fund_group_ids, get_eligible_procedures_for_direct_payment, get_all_eligible_procedures_for_direct_payment, get_procedures_by_ids, create_direct_transfer, update_direct_transfer, delete_direct_transfer, get_transfer_procedure_ids
- 2026-05-02 — Rescoped: read_all_bank_transfers moved to bank-contract.md (context/bank); BankEntry/BankAccount types moved there too
