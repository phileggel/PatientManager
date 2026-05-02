# Contract — Bank (context/bank)

> Domain: bank
> Backend module: context/bank
> Last updated by: bank-account spec + retroactive from specta_builder.rs

## Commands

### `create_bank_account` — R1

Creates a new bank account with a name and an optional IBAN. The IBAN is stripped of spaces and stored normalised. If the name is empty or whitespace-only, the command fails immediately.

- **Args:** `name: String, iban: Option<String>`
- **Returns:** `BankAccount`
- **Errors:** `NameEmpty`

---

### `read_all_bank_accounts` — R1

Returns all non-deleted bank accounts, including the default cash account (R4). Soft-deleted accounts are excluded.

- **Args:** —
- **Returns:** `Vec<BankAccount>`
- **Errors:** —

---

### `read_bank_account` — R1

Returns a single bank account by ID.

> ⚠️ Backend gap: currently returns `Option<BankAccount>` with `None` as the not-found signal. Should return `BankAccount` and raise `NotFound` instead.

- **Args:** `id: String`
- **Returns:** `BankAccount`
- **Errors:** `NotFound`

---

### `update_bank_account` — R2, R4

Updates the name and/or IBAN of an existing account. The cash account (`cash-account-default`) must not be editable per R4.

> ⚠️ Backend gap: `CashAccountProtected` is not currently enforced.

- **Args:** `id: String, name: String, iban: Option<String>`
- **Returns:** `BankAccount`
- **Errors:** `NameEmpty`, `NotFound`, `CashAccountProtected`

---

### `delete_bank_account` — R3, R4

Soft-deletes a bank account (marks it as deleted; no data is removed). There is no blocking constraint on linked transfers — deletion is always allowed for non-cash accounts. The cash account (`cash-account-default`) must not be deletable per R4.

> ⚠️ Backend gap: `CashAccountProtected` is not currently enforced.

- **Args:** `id: String`
- **Returns:** `()`
- **Errors:** `NotFound`, `CashAccountProtected`

---

### `get_cash_bank_account_id` — R4

Returns the fixed ID of the default cash account (`cash-account-default`), seeded by migration. Called by the bank-transfer form to auto-assign the bank account when the payment method is CASH. The value is a compile-time constant on the backend; the frontend fetches it via command to avoid hardcoding it.

- **Args:** —
- **Returns:** `String`
- **Errors:** —

---


---

### `create_bank_transfer`

Creates a bare bank entry (without linked groups or procedures — links are managed by `bank_manual_match` use case). Used as a building block by the manual-match use case.

- **Args:** `transfer_date: String, amount: i64, transfer_type: BankEntryType, bank_account_id: String`
- **Returns:** `BankEntry`
- **Errors:** `AccountNotFound`, `InvalidDateFormat`

---

### `read_all_bank_transfers`

Returns all bank entries with their associated account info. Used to populate the transfers list view.

- **Args:** —
- **Returns:** `Vec<BankEntry>`
- **Errors:** —

---

### `read_bank_transfer`

Returns a single bank entry by ID.

- **Args:** `id: String`
- **Returns:** `BankEntry` (optional — `null` if not found)
- **Errors:** —

---

### `update_bank_transfer`

Updates an existing bank entry's fields (bare update — does not touch linked groups/procedures).

- **Args:** `transfer: BankEntry`
- **Returns:** `BankEntry`
- **Errors:** `TransferNotFound`

---

### `delete_bank_transfer`

Hard-deletes a bank entry (bare deletion — does not cascade to linked groups/procedures). Use `bank_manual_match` commands for deletion with rollback.

- **Args:** `id: String`
- **Returns:** `()`
- **Errors:** `TransferNotFound`

---

## Shared Types

```rust
struct BankAccount {
    id: String,
    name: String,
    iban: String,   // nullable; null when no IBAN has been set
}

struct BankEntry {
    id: String,
    transfer_date: String,      // ISO date YYYY-MM-DD
    amount: i64,                // in thousandths of a euro
    transfer_type: BankEntryType,
    bank_account: BankAccount,
}

// R2 (bank-statement-manual-match) — transfer/payment type
enum BankEntryType {
    FundWire,           // FUND transfer from insurance
    PatientCheck,       // check from patient
    PatientCreditCard,  // card payment from patient
    PatientCash,        // cash — auto-assigns the cash account
    OutgoingWire,       // reserved for overpayment refund (REF-080); not creatable in manual-match
}
```

## Events

| Event                | Trigger                                                                            |
| -------------------- | ---------------------------------------------------------------------------------- |
| `BankAccountUpdated` | After `create_bank_account`, `update_bank_account`, `delete_bank_account`         |
| `BankEntryUpdated`   | After `create_bank_transfer`, `update_bank_transfer`, `delete_bank_transfer`      |

## Changelog

- 2026-04-29 — Added by `bank-account` spec: create_bank_account, read_all_bank_accounts, read_bank_account, update_bank_account, delete_bank_account, get_cash_bank_account_id
- 2026-04-29 — Deep review applied: added per-command intent and spec rule tracing, soft-delete exclusion note on read_all, None-signal note on read_bank_account, get_cash_bank_account_id frontend usage, backend gaps noted on update and delete, event triggers documented
- 2026-05-02 — Added retroactively from specta_builder.rs: create_bank_transfer, read_all_bank_transfers, read_bank_transfer, update_bank_transfer, delete_bank_transfer
