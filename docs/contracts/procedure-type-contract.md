# Contract — Procedure Type

> Domain: procedure-type
> Last updated by: procedure-type spec

## Commands

### `read_all_procedure_types` — R9, R23

Returns all procedure types including the reserved `import-pdf` type. The frontend filters out `import-pdf` before display (R23). Used to populate the procedure-types table and the procedure form dropdown.

- **Args:** —
- **Returns:** `Vec<ProcedureType>`
- **Errors:** —

---

### `add_procedure_type` — R1, R2, R3, R4, R5, R6, R21

Creates a new procedure type. Validates: name non-empty after trim (R1), `default_amount` ≥ 0 (R2), category normalised to `null` if empty (R3), name uniqueness case-insensitively including the reserved name `"Import"` (R4, R21). Publishes `ProcedureTypeUpdated` event (R5).

- **Args:** `name: String, default_amount: i64, category: String`
- **Returns:** `ProcedureType`
- **Errors:** `EmptyName`, `NegativeAmount`, `DuplicateName`

---

### `update_procedure_type` — R1, R2, R3, R4, R5, R22

Updates an existing procedure type. Same field validations as creation (R1–R4). Rejects any attempt to edit the reserved `import-pdf` type (R22). Publishes `ProcedureTypeUpdated` event (R5).

- **Args:** `raw: RawProcedureType`
- **Returns:** `ProcedureType`
- **Errors:** `ProcedureTypeNotFound`, `EmptyName`, `NegativeAmount`, `DuplicateName`, `ReservedType`

---

### `delete_procedure_type` — R5, R6, R22

Soft-deletes a procedure type. The type is marked deleted and no longer returned in reads (R6). Existing procedures that reference it keep their reference. Rejects deletion of the reserved `import-pdf` type (R22). Publishes `ProcedureTypeUpdated` event (R5).

> Side effect: any patient whose `latest_procedure_type` references this type has `latest_procedure_type` and `latest_date` cleared (POC R21).

- **Args:** `id: String`
- **Returns:** `()`
- **Errors:** `ProcedureTypeNotFound`, `ReservedType`

---

## Shared Types

```rust
// R9 — a procedure type template
struct ProcedureType {
    id: String,
    name: String,
    default_amount: i64,  // in thousandths of a euro; ≥ 0 (R2)
    category: String,     // optional; null if not set (R3)
}

// R17 — raw update input from the frontend
struct RawProcedureType {
    id: String,
    name: String,
    default_amount: i64,
    category: String,     // optional
}
```

## Events

| Event                  | Trigger                                                                           |
| ---------------------- | --------------------------------------------------------------------------------- |
| `ProcedureTypeUpdated` | After `add_procedure_type`, `update_procedure_type`, `delete_procedure_type` (R5) |

## Changelog

- 2026-05-02 — Added by `procedure-type` spec: read_all_procedure_types, add_procedure_type, update_procedure_type, delete_procedure_type
