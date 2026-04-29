# Contract — Bank Account

> Domain: bank-account
> Last updated by: bank-account spec

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

## Shared Types

```rust
struct BankAccount {
    id: String,
    name: String,
    iban: String,   // nullable; null in the wire format when no IBAN has been set (R1)
}
```

## Events

| Event                | Trigger                                                        |
| -------------------- | -------------------------------------------------------------- |
| `BankAccountUpdated` | After `create_bank_account`, `update_bank_account`, `delete_bank_account` |

## Changelog

- 2026-04-29 — Added by `bank-account` spec: create_bank_account, read_all_bank_accounts, read_bank_account, update_bank_account, delete_bank_account, get_cash_bank_account_id
- 2026-04-29 — Deep review applied: added per-command intent and spec rule tracing, soft-delete exclusion note on read_all, None-signal note on read_bank_account, get_cash_bank_account_id frontend usage, backend gaps noted on update and delete, event triggers documented
