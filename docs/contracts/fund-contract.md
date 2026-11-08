# Contract — Fund

> Domain: fund
> Backend module: context/fund; `delete_fund` in use_cases/procedure_orchestration
> Last updated by: `procedure-orchestration` spec, PRO-291 (#590), 2026-11-08

## Commands

### Fund CRUD

### `add_fund`

Creates a new fund with an identifier and a name. Both are trimmed: the screen sends what was typed.

- **Args:** `fund_identifier: String, fund_name: String`
- **Returns:** `Fund`
- **Errors:** `FundInvalid { reasons }` (every empty field at once: `IdentifierEmpty`, `NameEmpty`), `IdentifierAlreadyUsed` (another fund holds the identifier), `DatabaseError`

---

### `read_all_funds`

Returns all funds. Used to populate the fund dropdown in the procedure form and the fund filter in various pickers.

- **Args:** —
- **Returns:** `Vec<Fund>`
- **Errors:** `DatabaseError`

---

### `update_fund`

A user's edit of a fund: the identifier and the name, trimmed and validated, are written onto the stored fund.

- **Args:** `fund: Fund`
- **Returns:** `Fund`
- **Errors:** `FundInvalid { reasons }` (as `add_fund`), `FundNotFound`, `IdentifierAlreadyUsed` (as `add_fund`; a fund keeps its own identifier), `DatabaseError`

---

### `delete_fund` — PRO-290 to PRO-293

Deletes a fund (PRO-292); its identifier can be used again. Refuses a fund procedures or fund payment groups use, with both counts. An unknown id is not an error: the command succeeds and changes nothing. In the same transaction, every patient whose latest fund is this one has it cleared (PRO-290); a failure leaves both unchanged. Handled by the `procedure_orchestration` use case.

- **Args:** `id: String`
- **Returns:** `()`
- **Errors:** `FundInUse { procedure_count, payment_group_count }` (PRO-291), `DatabaseError`

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

### `delete_fund_payment_group` — FPM R9, R11, REF-240

Really deletes the group and its lines, and resets all linked procedures to `Created`, clearing their `fund_reconciliation_date` and `paid_amount`. Blocked if the group is `BankPayed` (FPM R9). Also rejects deletion of a group whose `origin` is `Refund` (REF-240), whoever calls the use case.

- **Args:** `group_id: String`
- **Returns:** `()`
- **Errors:** `PaymentGroupNotFound { fund_payment_group_id }`, `GroupLocked`, `RefundGroupProtected` (REF-240), `DatabaseError`

---

## Shared Types

```rust
struct Fund {
    id: String,
    fund_identifier: String,
    name: String,
    temp_id: Option<String>,   // batch import only; absent on the wire otherwise
}

// One per invalid field of a fund form, inside `FundInvalid { reasons }`
enum FundInvalidReason { IdentifierEmpty, NameEmpty }

// FPM R10 — a fund-payment group aggregate
struct FundPaymentGroup {
    id: String,
    fund_id: String,
    payment_date: String,   // ISO date YYYY-MM-DD
    total_amount: i64,      // sum of procedure amounts; recomputed on every change (FPM R4)
    lines: Vec<FundPaymentLine>,
    status: FundPaymentGroupStatus,
    is_locked: bool,        // derived from status; true when BankPayed (FPM R10)
    origin: GroupOrigin,    // set once at creation (REF-240)
}

// REF-240 — where a group comes from
enum GroupOrigin { Payment, Refund }  // wire: "PAYMENT" | "REFUND"

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
| `FundUpdated`      | After `add_fund`, `update_fund`, `delete_fund`                                                                                                             |
| `PatientUpdated`   | After `delete_fund` (PRO-290)                                                                                                                              |

## Changelog

- 2026-11-07 — Modified by `fund-payment-manual-match` spec (FPM-400, #586): `delete_fund_payment_group` really deletes the group; no signature change.
- 2026-11-02 — Modified by `fund-payment-manual-match` spec (FPM-400, #585): `delete_fund_payment_group` really deletes the group's lines; no signature change.
- 2026-10-18 — Modified by `overpayment` spec (REF-240, ticket #355): `FundPaymentGroup` carries `origin` (`GroupOrigin`); `delete_fund_payment_group` answers `RefundGroupProtected` from the use case, its errors listed as the code sends them
- 2026-10-14 — Modified by `procedure-orchestration` spec (DEBT-042): delete_fund
- 2026-11-08 — `delete_fund` (#590, PRO-291): a fund is really deleted; a fund in use is refused with `FundInUse`.
