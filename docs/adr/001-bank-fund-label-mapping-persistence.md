# ADR 001 — Persistence of label→fund mappings (BankFundLabelMapping)

**Date**: 2026-04-07
**Status**: Accepted

## Context

Automatic bank reconciliation (spec `bank-statement-auto-match`) needs to remember, per bank account, the association between a transfer label (e.g. `CPAM93`) and a fund in the database, or an explicit rejection (non-fund label). These mappings are entered by the user during the first import of a statement and must be pre-filled on subsequent imports.

Three design decisions were made during the initial implementation (R1–R22):

1. How to represent the "rejected" state in the database.
2. Which upsert strategy to adopt to avoid duplicate records.
3. How to guarantee functional uniqueness `(account, label)` while staying consistent with the project's soft-delete pattern.

## Decision

### 1. Rejection represented by `fund_id = NULL`

The "rejected" state (label identified as non-fund) is stored as `fund_id = NULL` in the `bank_fund_label_mapping` table. No separate `is_rejected` boolean column.

The Rust API accepts the sentinel value `"REJECTED"` as input (for consistency with the frontend) and converts it to `None` before persistence. The `BankFundLabelMapping` domain type exposes `fund_id: Option<String>` — `None` = rejected, `Some(id)` = fund assigned.

**Alternatives considered:**

- Separate `is_rejected BOOLEAN` column: redundant with `fund_id` nullability, introduces a possible inconsistent state (`fund_id` set AND `is_rejected = true`).
- Sentinel value persisted in the database (`"REJECTED"`): violates referential integrity (FK on `fund_id`).

### 2. Upsert via check-then-update

Saving a mapping first looks up the active record `(bank_account_id, bank_label)`, then performs an `UPDATE SET fund_id` if found, or an `INSERT` otherwise.

This approach preserves the record's UUID `id` across updates, unlike `INSERT OR REPLACE` which would generate a new UUID on every upsert and break any potential external reference.

### 3. Soft-delete with partial uniqueness index

The table uses `is_deleted INTEGER NOT NULL DEFAULT 0` (consistent with all other entities in the project). Functional uniqueness is guaranteed by a partial index:

```sql
CREATE UNIQUE INDEX idx_bank_fund_label_active
    ON bank_fund_label_mapping(bank_account_id, bank_label)
    WHERE is_deleted = 0;
```

This allows a soft-deleted record to coexist with a new active record for the same `(account, label)`, without a global uniqueness constraint.

The functional key is therefore `(bank_account_id, bank_label)` among active records.

## Consequences

- **Pros**:
  - Full consistency with the project's soft-delete pattern (no exception).
  - `fund_id: Option<String>` is idiomatic in Rust — the compiler forces handling of the `None` case.
  - The UUID `id` is stable across updates, compatible with potential future references.
  - FK on `fund_id` enforced by SQLite (NULL excluded from FK checks).

- **Cons**:
  - If a fund is deleted (soft-delete), its active mappings point to a `fund_id` that is valid in the database but invisible in the UI — functional orphans not detected at the SQL level. Accepted behavior: cascading soft-delete to mappings is not implemented.
  - The sentinel value `"REJECTED"` in the Tauri command API (`save_bank_fund_label_mappings`) is an implicit, untyped convention on the frontend — an explicit discriminated type would be more robust.
