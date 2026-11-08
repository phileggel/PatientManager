# Contract — Patient

> Domain: patient
> Backend module: context/patient; `delete_patient` in use_cases/procedure_orchestration
> Last updated by: `procedure-orchestration` spec, PRO-296 to PRO-298 (#591), 2026-11-08

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

### `delete_patient` — PRO-296 to PRO-298

Deletes a patient with its duplicate dismissals; its name and SSN leave the database. Refuses a patient procedures name, with their count. An unknown id is not an error: the command succeeds and changes nothing. Handled by the `procedure_orchestration` use case.

- **Args:** `id: String`
- **Returns:** `()`
- **Errors:** `PatientInUse { procedure_count }` (PRO-296), `DatabaseError`

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

## Changelog

- 2026-11-08 — `delete_patient` (#591, PRO-296 to PRO-298): a patient is really deleted with its dismissals; a patient with procedures is refused with `PatientInUse`; the command moves to the `procedure_orchestration` use case.
