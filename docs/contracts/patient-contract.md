# Contract — Patient

> Domain: patient
> Backend module: context/patient
> Last updated by: retroactive (no dedicated spec — commands derived from specta_builder.rs)

## Commands

### `add_patient`

Creates a new patient. Used both from the inline-creation form inside the procedure modal (POC R9) and from batch import flows. SSN is optional; if provided it must be valid (13 ASCII digits).

- **Args:** `name: String, ssn: String`
- **Returns:** `Patient`
- **Errors:** `InvalidSsn`

---

### `read_all_patients`

Returns all patients. Used to populate the patient ComboboxField in the procedure form (POC R29).

- **Args:** —
- **Returns:** `Vec<Patient>`
- **Errors:** —

---

### `update_patient`

Updates an existing patient's name and/or SSN.

- **Args:** `patient: Patient`
- **Returns:** `Patient`
- **Errors:** `PatientNotFound`, `InvalidSsn`

---

### `delete_patient`

Hard-deletes a patient record.

- **Args:** `id: String`
- **Returns:** `()`
- **Errors:** `PatientNotFound`

---

## Shared Types

```rust
struct Patient {
    id: String,
    name: Option<String>,
    ssn: Option<String>,         // 13 ASCII digits when present
    is_anonymous: bool,
    // tracking fields (updated by procedure_orchestration use case):
    // latest_date, latest_procedure_type, latest_fund, latest_procedure_amount
}
```

## Events

None — patient mutations do not emit domain events directly.
