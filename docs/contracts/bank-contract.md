# Contract — Bank (context/bank)

> Domain: bank
> Backend module: context/bank
> Last updated by: bank-account spec + retroactive from specta_builder.rs

## Commands

### `create_bank_account` — BAC-010 to BAC-014, BAC-020

Creates a new bank account with a name and an optional IBAN. The IBAN is stripped of spaces and stored normalised. If the name is empty or whitespace-only, the command fails immediately. A name another account that is not deleted holds — compared exactly, case included, once trimmed, the cash account under its stored name — is refused with `BankAccountNameAlreadyUsed` (BAC-013). BAC-014 — IBAN uniqueness applies across all accounts including soft-deleted: creation is rejected if the supplied IBAN is already used by any existing or soft-deleted account.

- **Args:** `name: String, iban: Option<String>`
- **Returns:** `BankAccount`
- **Errors:** `BankAccountNameEmpty`, `BankAccountNameAlreadyUsed`, `IbanAlreadyUsed`, `DatabaseError`

---

### `read_all_bank_accounts` — BAC-016, BAC-041, BAC-042, BAC-050, BAC-073

Returns all non-deleted bank accounts, including the default cash account (BAC-050). Soft-deleted accounts are excluded.

- **Args:** —
- **Returns:** `Vec<BankAccount>`
- **Errors:** `DatabaseError`

---

### `update_bank_account` — BAC-010 to BAC-014, BAC-030, BAC-051

Replaces the name and IBAN of an account that is not deleted: both are sent, and `iban: None` clears it; the IBAN is stored without spaces. An unknown or deleted account is refused with `BankAccountNotFound` (BAC-030). The cash account (`cash-account-default`) must not be editable per BAC-051. A name another account that is not deleted holds — compared exactly, case included, once trimmed, the cash account under its stored name — is refused with `BankAccountNameAlreadyUsed` (BAC-013). BAC-014 — IBAN uniqueness applies across all accounts including soft-deleted: edit is rejected if the new IBAN is already used by another existing or soft-deleted account.

- **Args:** `id: String, name: String, iban: Option<String>`
- **Returns:** `BankAccount`
- **Errors:** `BankAccountNameEmpty`, `BankAccountNameAlreadyUsed`, `BankAccountNotFound`, `ProtectedCashAccount`, `IbanAlreadyUsed`, `DatabaseError`

---

### `delete_bank_account` — BAC-041, BAC-043, BAC-051

Soft-deletes a bank account (marks it as deleted; no data is removed). It is refused while any bank entry is recorded on the account (BAC-043). The cash account (`cash-account-default`) must not be deletable per BAC-051.

- **Args:** `id: String`
- **Returns:** `()`
- **Errors:** `BankAccountNotFound`, `ProtectedCashAccount`, `BankAccountHoldsBankEntries` (BAC-043), `DatabaseError`

---

### `get_cash_bank_account_id` — BAC-050, BSM-026

Returns the fixed ID of the default cash account (`cash-account-default`), seeded by migration. Called by the bank-transfer form to leave the cash account out of its account list; a CASH entry's account is set by the backend (BSM-026). The value is a compile-time constant on the backend; the frontend fetches it via command to avoid hardcoding it.

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
    iban: Option<String>,   // null when no IBAN has been set
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

| Event                | Trigger                                                                      |
| -------------------- | ---------------------------------------------------------------------------- |
| `BankAccountUpdated` | After `create_bank_account`, `update_bank_account`, `delete_bank_account`    |
| `BankEntryUpdated`   | After `create_bank_transfer`, `update_bank_transfer`, `delete_bank_transfer` |

## Changelog

- 2026-04-29 — Added by `bank-account` spec: create_bank_account, read_all_bank_accounts, read_bank_account, update_bank_account, delete_bank_account, get_cash_bank_account_id
- 2026-04-29 — Deep review applied: added per-command intent and spec rule tracing, soft-delete exclusion note on read_all, None-signal note on read_bank_account, get_cash_bank_account_id frontend usage, backend gaps noted on update and delete, event triggers documented
- 2026-05-02 — Added retroactively from specta_builder.rs: create_bank_transfer, read_all_bank_transfers, read_bank_transfer, update_bank_transfer, delete_bank_transfer
- 2026-05-02 — Backend gaps resolved: CashAccountProtected enforced on update/delete; file renamed from bank-account-contract.md to bank-contract.md; read_bank_account command removed (unused — service method kept for internal orchestrator use)
- 2026-05-04 — Added by `bank-statement-auto-match` spec (BAS-013) and `bank-account` R5: IbanAlreadyUsed error variant on create_bank_account and update_bank_account; IBAN uniqueness now spans soft-deleted accounts.
- 2026-10-24 — `get_cash_bank_account_id`: the form uses it to leave the cash account out of its list; a CASH entry's account is the backend's (bank-statement-manual-match BSM-026, #455)
- 2026-10-24 — `delete_bank_account`: refused with `BankAccountHoldsBankEntries` while a bank entry is on the account (R6, #448); the Errors of `create_bank_account` and `update_bank_account` spelled as on the wire; `read_all_bank_accounts` lists `DatabaseError`
- 2026-10-24 — the `bank-account` rules renumbered R1–R9 → BAC (#503); `create_bank_account` and `update_bank_account` refuse a taken name with `BankAccountNameAlreadyUsed` (BAC-013); `update_bank_account` returns `BankAccountNotFound` for an unknown or deleted account (BAC-030)
