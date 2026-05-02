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

### `validate_batch_patients`

Validates a list of patient candidates before batch creation. Each candidate is checked against existing records (SSN deduplication). Returns a per-candidate validation result without persisting anything.

- **Args:** `patients: Vec<PatientCandidate>`
- **Returns:** `ValidateBatchPatientsResponse`
- **Errors:** —

---

### `create_batch_patients`

Creates a batch of validated patient candidates in a single transaction. Returns the created `Patient` records and a `temp_id → real_id` map used by the caller to resolve procedure foreign keys.

- **Args:** `patients: Vec<PatientCandidate>`
- **Returns:** `CreateBatchPatientsResponse`
- **Errors:** `BatchCreationFailed`

---

## Shared Types

```rust
struct Patient {
    id: String,
    name: String,        // optional
    ssn: String,         // optional; 13 ASCII digits when present
    is_anonymous: bool,
    // tracking fields (updated by procedure_orchestration use case):
    // latest_date, latest_procedure_type, latest_fund, latest_procedure_amount
}

// batch import candidate — lacks a real ID
struct PatientCandidate {
    temp_id: String,     // UUID assigned at parse time; used to build temp → real map
    name: String,        // optional
    ssn: String,         // optional
}

struct PatientValidationResult {
    candidate: PatientCandidate,
    status: PatientValidationStatus,
    existing_id: String,   // optional; populated when status = AlreadyExists
    error: String,         // optional; populated when status = Invalid
}

enum PatientValidationStatus {
    Valid,
    AlreadyExists,
    Invalid,
}

struct ValidateBatchPatientsResponse {
    results: Vec<PatientValidationResult>,
}

struct CreateBatchPatientsResponse {
    patients: Vec<Patient>,
    temp_id_map: Map<String, String>,  // temp_id → real patient ID
}
```

## Events

None — patient mutations do not emit domain events directly.

## Changelog

- 2026-05-02 — Added retroactively from specta_builder.rs: add_patient, read_all_patients, update_patient, delete_patient, validate_batch_patients, create_batch_patients
