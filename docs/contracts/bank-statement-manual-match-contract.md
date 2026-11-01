# Contract — Bank Statement Manual Match

> Domain: bank-statement-manual-match
> Last updated by: `bank-statement-manual-match` spec (BSM-034 to BSM-036, ticket #461)

> Wire errors are the composite `BankManualMatchError` (untagged union of `BankError`, `FundError`, `ProcedureError`, and the use-case `BankManualMatchTask`). Each variant serializes as `{ "code": "<Variant>", ... }`; the rows below list the codes reachable per command. `DatabaseError` is the shared infra catch-all and may surface on any command that touches a repository.

## Commands

> `get_cash_bank_account_id` is owned by `context/bank` — see bank-contract.md.

### `get_unsettled_fund_groups` — R6

Returns fund-payment groups not yet reconciled at the bank level whose payment date falls within 7 days preceding `transfer_date`. Populates the initial group selection UI.

- **Args:** `transfer_date: String`
- **Returns:** `Vec<FundGroupCandidate>`
- **Errors:** `InvalidTransferDateFormat`, `DatabaseError`

---

### `get_all_unsettled_fund_groups` — R12

Returns all fund-payment groups not yet reconciled at the bank level, no date constraint. Used for the "Broaden search" modal.

- **Args:** —
- **Returns:** `Vec<FundGroupCandidate>`
- **Errors:** `DatabaseError`

---

### `get_fund_groups_by_ids` — R21

Returns `FundGroupCandidate` details for a given set of IDs. Used in the FUND-transfer edit modal to display currently linked groups (in `BankPaid` status) as pre-selected items.

- **Args:** `group_ids: Vec<String>`
- **Returns:** `Vec<FundGroupCandidate>`
- **Errors:** `DatabaseError` (unknown IDs are silently skipped, not an error)

---

### `create_fund_transfer` — R6, R7, BSM-020, BSM-021, BSM-034

Creates a `FUND` bank entry linked to the given group IDs. On success: procedures move `Reconciliated` → `FundPayed` / `PartiallyReconciled` → `PartiallyFundPayed`; groups move to `BankPayed` and become locked; procedures' `confirmed_payment_date` is set to the transfer date and `payment_method` to `BankTransfer`.

- **Args:** `bank_account_id: String, transfer_date: String, group_ids: Vec<String>`
- **Returns:** `BankManualMatchResult`
- **Errors:** `BankEntryInvalid { reasons }` (BSM-020, answered first, nothing read), `PaymentGroupNotFound`, `AmountNotPositive`, `BankAccountNotFound`, `DatabaseError`

---

### `update_fund_transfer` — R9, R10, R11, BSM-030, BSM-031, BSM-034, BSM-035

Updates the date and/or group composition of an existing FUND transfer. Newly added groups receive the same status effects as creation (R10 → R7); removed groups are rolled back as in deletion (R11 → R8). Amount recomputed from the final group set.

- **Args:** `transfer_id: String, new_transfer_date: String, new_group_ids: Vec<String>`
- **Returns:** `BankEntryEdit` — `Unchanged` when the date and the groups (as a set, order aside) equal the stored ones (BSM-031), decided after `TransferNotFound` and `WrongTransferType`, before any write
- **Errors:** `BankEntryInvalid { reasons }` (BSM-030, answered first, nothing read), `TransferNotFound`, `WrongTransferType` (R4), `PaymentGroupNotFound`, `AmountNotPositive`, `BankAccountNotFound`, `DatabaseError`

---

### `delete_fund_transfer` — R5, R8

Hard-deletes a FUND transfer and rolls back all linked groups: procedures revert `FundPayed` → `Reconciliated` / `PartiallyFundPayed` → `PartiallyReconciled`; groups return to `Active` and unlock; procedures' `confirmed_payment_date` is restored to the group payment date and `payment_method` is cleared.

- **Args:** `transfer_id: String`
- **Returns:** `()`
- **Errors:** `TransferNotFound`, `WrongTransferType` (R4), `DatabaseError`

---

### `get_transfer_fund_group_ids` — R21

Returns the IDs of groups currently linked to a FUND transfer. Used alongside `get_fund_groups_by_ids` to pre-populate the edit modal.

- **Args:** `transfer_id: String`
- **Returns:** `Vec<String>`
- **Errors:** `DatabaseError`

---

### `get_eligible_procedures_for_direct_payment` — R14

Returns procedures in `Created` status whose `procedure_date` is within 7 days preceding `payment_date`. Populates the initial procedure selection UI for direct payments.

- **Args:** `payment_date: String`
- **Returns:** `Vec<DirectPaymentProcedureCandidate>`
- **Errors:** `InvalidTransferDateFormat`, `DatabaseError`

---

### `get_all_eligible_procedures_for_direct_payment` — R20

Returns all procedures in `Created` status with no date constraint. Used for the "Broaden search" modal in the direct payment UI.

- **Args:** —
- **Returns:** `Vec<DirectPaymentProcedureCandidate>`
- **Errors:** `DatabaseError`

---

### `get_procedures_by_ids` — R21

Returns `DirectPaymentProcedureCandidate` details for a given set of IDs. Used in the direct-payment edit modal to display currently linked procedures (in `DirectlyPaid` status) as pre-selected items.

- **Args:** `procedure_ids: Vec<String>`
- **Returns:** `Vec<DirectPaymentProcedureCandidate>`
- **Errors:** `DatabaseError` (unknown IDs are silently skipped, not an error)

---

### `create_direct_transfer` — R13, R14, R15, BSM-020, BSM-021, BSM-026, BSM-034, BSM-036

Creates a direct payment bank entry (`PATIENT_CHECK`, `PATIENT_CREDIT_CARD`, or `PATIENT_CASH`) linked to the given procedure IDs. For `PATIENT_CASH`, the backend stores `cash-account-default`, whatever `bank_account_id` it is sent, even an unknown one (BSM-026); the screen sends an empty one. On success: each procedure moves to `DirectlyPayed`; `payment_method`, `confirmed_payment_date`, and `actual_payment_amount` are set according to the type mapping in `BankEntryType`.

> REF-080: `FundOutgoingWire` (refund-only) is rejected — `RefundOnlyVariantRejected` is returned.

- **Args:** `bank_account_id: String, transfer_date: String, transfer_type: BankEntryType, procedure_ids: Vec<String>`
- **Returns:** `BankManualMatchResult`
- **Errors:** `BankEntryInvalid { reasons }` (BSM-020, answered first, nothing read), `RefundOnlyVariantRejected` (REF-080), `ProcedureNotFound { procedure_id }` (BSM-036), `AmountNotPositive`, `BankAccountNotFound`, `DatabaseError`

---

### `update_direct_transfer` — R17, R18, R19, BSM-030, BSM-031, BSM-034, BSM-035, BSM-036

Updates the date and/or procedure composition of an existing direct payment. Newly added procedures receive the same effects as creation (R18); removed procedures are rolled back as in deletion (R19). Amount recomputed.

- **Args:** `transfer_id: String, new_transfer_date: String, new_procedure_ids: Vec<String>`
- **Returns:** `BankEntryEdit` — `Unchanged` when the date and the procedures (as a set, order aside) equal the stored ones (BSM-031), decided after `TransferNotFound` and `WrongTransferType`, before any write
- **Errors:** `BankEntryInvalid { reasons }` (BSM-030, answered first, nothing read), `TransferNotFound`, `WrongTransferType` (R4), `ProcedureNotFound { procedure_id }` (BSM-036), `AmountNotPositive`, `BankAccountNotFound`, `DatabaseError`

---

### `delete_direct_transfer` — R5, R16

Hard-deletes a direct payment and rolls back all linked procedures to `Created` status, clearing `payment_method`, `confirmed_payment_date`, and `actual_payment_amount`.

- **Args:** `transfer_id: String`
- **Returns:** `()`
- **Errors:** `TransferNotFound`, `WrongTransferType` (R4), `DatabaseError`

---

### `get_transfer_procedure_ids` — R21

Returns the IDs of procedures currently linked to a direct payment. Used alongside `get_procedures_by_ids` to pre-populate the edit modal.

- **Args:** `transfer_id: String`
- **Returns:** `Vec<String>`
- **Errors:** `DatabaseError`

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
    billed_amount: Option<i64>,  // absent if not yet set
}

// R7, R10, R11, R15, R18, R19 — result of a create/update operation with linked items
struct BankManualMatchResult {
    transfer_id: String,
    linked_count: u32,  // number of groups or procedures linked after the operation
}

// BSM-031 — what an edit did; wire: { outcome: "Updated", result } | { outcome: "Unchanged" }
enum BankEntryEdit {
    Updated { result: BankManualMatchResult },
    Unchanged,  // nothing written, no event published
}

// BSM-020, BSM-030 — BankError::BankEntryInvalid { reasons: Vec<BankEntryInvalidReason> },
// one reason per refused field, at most one of DateMissing / DateInvalid
enum BankEntryInvalidReason {
    AccountMissing,   // empty or blank; creation only, not for PatientCash (R13: the backend sets the cash account)
    DateMissing,      // empty or blank
    DateInvalid,      // not a valid YYYY-MM-DD date
    NothingSelected,  // no group or procedure
}
```

## Events

An edit answered `Unchanged` (BSM-031), or a creation or edit refused or failed (BSM-034), publishes none of them.

| Event                     | Trigger                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| `ProcedureUpdated`        | After create/update/delete of either transfer type — procedure status or payment fields changed |
| `FundPaymentGroupUpdated` | After create/update/delete of a FUND transfer — group status or lock state changed              |
| `BankEntryUpdated`        | After any write operation — `BankEntry` records created or removed                              |

## Changelog

- 2026-11-01 — BSM-034 to BSM-036 (#461): the four create and update commands write in one unit of work; a refused or failed command publishes no event; a direct selection with an unknown or deleted procedure answers `ProcedureNotFound { procedure_id }`.
- 2026-10-19 — Modified by `bank-statement-manual-match` spec (BSM-020 to BSM-031, ticket #351): the four create/update commands answer `BankEntryInvalid { reasons }` first, `InvalidTransferDateFormat` no longer reached; the two update commands return `BankEntryEdit`; the `PATIENT_CASH` account line follows the code
- 2026-05-02 — Added by `bank-statement-manual-match` spec: get_cash_bank_account_id, get_unsettled_fund_groups, get_all_unsettled_fund_groups, get_fund_groups_by_ids, create_fund_transfer, update_fund_transfer, delete_fund_transfer, get_transfer_fund_group_ids, get_eligible_procedures_for_direct_payment, get_all_eligible_procedures_for_direct_payment, get_procedures_by_ids, create_direct_transfer, update_direct_transfer, delete_direct_transfer, get_transfer_procedure_ids
- 2026-05-02 — Rescoped: read_all_bank_transfers moved to bank-contract.md (context/bank); BankEntry/BankAccount types moved there too
- 2026-06-09 — Typed-error migration: per-command Errors columns now list the real wire-visible `BankManualMatchError` variant codes (`BankError`/`FundError`/`ProcedureError`/`WrongTransferType`), replacing the pre-implementation aspirational names
- 2026-10-24 — `create_direct_transfer`: a `PATIENT_CASH` creation stores `cash-account-default`, whatever account it is sent (BSM-026, #455)
