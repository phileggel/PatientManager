# Contract — Bank (context/bank)

> Domain: bank
> Backend module: context/bank
> Last updated by: bank-account spec, BAC-014, BAC-041 (#584), 2026-11-07

## Commands

### `create_bank_account` — BAC-010 to BAC-014, BAC-020

Creates a new bank account with a name and an optional IBAN. The IBAN is stripped of spaces and stored normalised. If the name is empty or whitespace-only, the command fails immediately. A name another account holds — compared exactly, case included, once trimmed, among the `bank` accounts (BAC-050) — is refused with `BankAccountNameAlreadyUsed` (BAC-013). An IBAN another account uses is refused with `IbanAlreadyUsed` (BAC-014); a deleted account is gone, so its name and IBAN can be used again.

- **Args:** `name: String, iban: Option<String>`
- **Returns:** `BankAccount`
- **Errors:** `BankAccountNameEmpty`, `BankAccountNameAlreadyUsed`, `IbanAlreadyUsed`, `DatabaseError`

---

### `read_all_bank_accounts` — BAC-016, BAC-041, BAC-042, BAC-055, BAC-073

Returns the `bank` accounts, never a technical one (BAC-055); a deleted account is gone (BAC-041).

- **Args:** —
- **Returns:** `Vec<BankAccount>`
- **Errors:** `DatabaseError`

---

### `update_bank_account` — BAC-010 to BAC-014, BAC-030, BAC-051

Replaces the name and IBAN of an account: both are sent, and `iban: None` clears it; the IBAN is stored without spaces. An unknown account, a deleted one included, is refused with `BankAccountNotFound` (BAC-030). A technical account is refused with `ProtectedTechnicalAccount` (BAC-051). A name another account holds — compared exactly, case included, once trimmed, among the `bank` accounts (BAC-050) — is refused with `BankAccountNameAlreadyUsed` (BAC-013). An IBAN another account uses is refused with `IbanAlreadyUsed` (BAC-014).

- **Args:** `id: String, name: String, iban: Option<String>`
- **Returns:** `BankAccount`
- **Errors:** `BankAccountNameEmpty`, `BankAccountNameAlreadyUsed`, `BankAccountNotFound`, `ProtectedTechnicalAccount` (BAC-051), `IbanAlreadyUsed`, `DatabaseError`

---

### `delete_bank_account` — BAC-041, BAC-043, BAC-051

Really deletes a bank account and its bank statement labels (BAC-041, BAS-046). It is refused with `BankAccountHoldsBankEntries` while any bank entry is recorded on the account, one written while the deletion ran included (BAC-043). A technical account is refused with `ProtectedTechnicalAccount` (BAC-051).

- **Args:** `id: String`
- **Returns:** `()`
- **Errors:** `BankAccountNotFound`, `ProtectedTechnicalAccount` (BAC-051), `BankAccountHoldsBankEntries` (BAC-043), `DatabaseError`

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

Updates an existing bank entry's fields (bare update — does not touch linked groups/procedures). Its account must be its own: a direct payment's technical account (BAC-056), a `bank` account for anything else (BAC-055A).

- **Args:** `transfer: BankEntry`
- **Returns:** `BankEntry`
- **Errors:** `TransferNotFound`, `BankAccountNotFound` (BAC-055A, BAC-056), `DatabaseError`

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
    PatientCash,        // cash — recorded on the `cash` technical account (BAC-056)
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
- 2026-11-02 — `delete_bank_account`: its labels are really deleted (#583).
- 2026-10-24 — `delete_bank_account`: refused with `BankAccountHoldsBankEntries` while a bank entry is on the account (R6, #448); the Errors of `create_bank_account` and `update_bank_account` spelled as on the wire; `read_all_bank_accounts` lists `DatabaseError`
- 2026-10-24 — the `bank-account` rules renumbered R1–R9 → BAC (#503); `create_bank_account` and `update_bank_account` refuse a taken name with `BankAccountNameAlreadyUsed` (BAC-013); `update_bank_account` returns `BankAccountNotFound` for an unknown or deleted account (BAC-030)
- 2026-11-07 — `delete_bank_account` really deletes the account (BAC-041, #584), its refusal kept when an entry is written meanwhile (BAC-043); a deleted account's name and IBAN can be used again (BAC-013, BAC-014); no signature change.
- 2026-11-08 — #518 (BAC-050 to BAC-059): `get_cash_bank_account_id` is removed; `read_all_bank_accounts` returns the `bank` accounts only; `ProtectedCashAccount` becomes `ProtectedTechnicalAccount`.
- 2026-11-08 — `update_bank_transfer`: an entry moved off its own account is refused with `BankAccountNotFound` (BAC-055A, BAC-056, #518).
