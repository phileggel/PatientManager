# Contract — Procedure Type

> Domain: procedure-type
> Last updated by: procedure-type spec (delete_procedure_type, R6, R24)

## Commands

### `read_all_procedure_types` — R9, R23

Returns all procedure types including the reserved `import-pdf` type. The frontend filters out `import-pdf` before display (R23). Used to populate the procedure-types table and the procedure form dropdown.

- **Args:** —
- **Returns:** `Vec<ProcedureType>`
- **Errors:** `DatabaseError`

---

### `add_procedure_type` — R1, R2, R3, R4, R5, R6, R21

Creates a new procedure type. Validates: name non-empty after trim (R1), `default_amount` ≥ 0 (R2), category normalised to `null` if empty (R3), name uniqueness case-insensitively including the reserved name `"Import"` (R4, R21). Publishes `ProcedureTypeUpdated` event (R5).

- **Args:** `name: String, default_amount: i64, category: Option<String>`
- **Returns:** `ProcedureType`
- **Errors:** `ProcedureTypeNameEmpty` (R1), `DefaultAmountNegative` (R2), `ProcedureTypeNameDuplicate` (R4, R21), `DatabaseError`

---

### `update_procedure_type` — R1, R2, R3, R4, R5, R22

A user's edit of a procedure type, written onto the stored one. Same field validations as creation (R1–R4). Rejects any attempt to edit the reserved `import-pdf` type (R22). Publishes `ProcedureTypeUpdated` event (R5).

- **Args:** `raw: RawProcedureType`
- **Returns:** `ProcedureType`
- **Errors:** `ReservedTypeNotMutable` (R22), `ProcedureTypeNotFound { procedure_type_id }`, `ProcedureTypeNameEmpty` (R1), `DefaultAmountNegative` (R2), `ProcedureTypeNameDuplicate` (R4), `DatabaseError`

---

### `delete_procedure_type` — R5, R6, R22, R24, PRO-280

Deletes a procedure type (R6). Rejects deletion of the reserved `import-pdf` type (R22), and of a type procedures use, with their count (R24). Publishes `ProcedureTypeUpdated` event (R5).

An unknown id is not an error: the command succeeds and changes nothing. In the same transaction, every patient whose latest procedure type is this one has it and its `latest_date` cleared (PRO-280); a failure leaves both unchanged. Handled by the `procedure_orchestration` use case.

- **Args:** `id: String`
- **Returns:** `()`
- **Errors:** `ProcedureOrchestrationError` — `ReservedTypeNotMutable` (R22), `ProcedureTypeInUse { procedure_count }` (R24), `DatabaseError`

---

## Shared Types

```rust
// R9 — a procedure type template
struct ProcedureType {
    id: String,
    name: String,
    default_amount: i64,  // in thousandths of a euro; ≥ 0 (R2)
    category: Option<String>,   // null if not set (R3)
}

// R17 — raw update input from the frontend
struct RawProcedureType {
    id: String,
    name: String,
    default_amount: i64,
    category: Option<String>,
}
```

## Events

| Event                  | Trigger                                                                           |
| ---------------------- | --------------------------------------------------------------------------------- |
| `ProcedureTypeUpdated` | After `add_procedure_type`, `update_procedure_type`, `delete_procedure_type` (R5) |
| `PatientUpdated`       | After `delete_procedure_type` (PRO-280)                                           |

## Changelog

- 2026-05-02 — Added by `procedure-type` spec: read_all_procedure_types, add_procedure_type, update_procedure_type, delete_procedure_type
- 2026-10-14 — Modified by `procedure-orchestration` spec (DEBT-042): delete_procedure_type
- 2026-11-07 — `delete_procedure_type` (#589, R6, R24): a type is really deleted; a type in use is refused with `ProcedureTypeInUse`.
- 2026-11-08 — `delete_procedure_type` (#590): its errors are the use case's `ProcedureOrchestrationError`; `ProcedureTypeInUse` leaves `ProcedureError` (a cross-context refusal, `ddd-reference.md` § Errors).
