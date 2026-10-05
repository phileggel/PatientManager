# Contract — Patient

> Domain: patient
> Backend module: context/patient
> Last updated by: retroactive (no dedicated spec — commands derived from specta_builder.rs)

## Commands

### `add_patient`

Creates a new patient. Used from the add-patient panel and from the inline-creation form inside the procedure modal (POC R9); the Excel import creates its patients in a batch, not through this command. SSN is optional; if provided it must be valid (13 ASCII digits). A patient created here is never anonymous, so a name is required. The name is trimmed and a blank SSN is read as none, as for `update_patient`: the screen sends what was typed.

- **Args:** `name: Option<String>, ssn: Option<String>`
- **Returns:** `Patient`
- **Errors:** `NameEmpty`, `NonAnonymousRequiresName`, `InvalidSsn`, `DatabaseError`

---

### `read_all_patients`

Returns all patients. Used to populate the patient ComboboxField in the procedure form (POC R29).

- **Args:** —
- **Returns:** `Vec<Patient>`
- **Errors:** `DatabaseError`

---

### `update_patient`

Saves a user's edit of a patient's name and SSN onto the stored patient. The name is trimmed and a blank SSN is read as none. Only a value the edit changes is validated: a name that became blank (for a patient who is not anonymous) or an SSN that is not 13 ASCII digits is refused, while a value stored before these rules existed does not block the correction of the other. Nothing else of the `Patient` sent is written — the tracking fields stay as stored.

- **Args:** `patient: Patient`
- **Returns:** `Patient`
- **Errors:** `NameEmpty`, `NonAnonymousRequiresName`, `InvalidSsn`, `PatientNotFound`, `DatabaseError`

---

### `delete_patient`

Soft-deletes a patient: the record is marked deleted and leaves every read. An unknown id is not an error.

- **Args:** `id: String`
- **Returns:** `()`
- **Errors:** `DatabaseError`

---

## Shared Types

```rust
struct Patient {
    id: String,
    name: Option<String>,
    ssn: Option<String>,         // 13 ASCII digits when present
    is_anonymous: bool,
    temp_id: Option<String>,                // batch import only; absent on the wire otherwise
    // tracking fields, written by the procedure flows, never by `update_patient`:
    latest_procedure_type: Option<String>,  // procedure type id
    latest_fund: Option<String>,            // fund id
    latest_date: Option<NaiveDate>,
    latest_procedure_amount: Option<i64>,   // thousandths of a euro
}
```

## Events

`PatientUpdated` — published after `add_patient`, `update_patient` and `delete_patient` succeed; the frontend reloads its patients on it.
