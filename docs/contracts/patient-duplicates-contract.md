# Contract — Patient Duplicates

> Domain: patient-duplicates
> Last updated by: patient-duplicates spec

## Commands

### `list_patient_duplicates` — PDU-010, PDU-011, PDU-012, PDU-013

Returns the candidate pairs, ordered: patients that are not deleted nor anonymous and carry the
same name, minus the dismissed pairs.

- **Args:** none
- **Returns:** `Vec<DuplicatePair>`
- **Errors:** `DatabaseError`

### `merge_patients` — PDU-021, PDU-022, PDU-023, PDU-024, PDU-025, PDU-026, PDU-028

Merges the other patient into the kept one, all or nothing: the procedures move, the kept patient
takes the SSN and tracking fields the rules give it, the other patient is deleted and its
dismissals are removed.

- **Args:** `kept_patient_id: String`, `other_patient_id: String`
- **Returns:** `()`
- **Errors:** `SamePatient`, `PatientNotFound` (either patient missing or deleted),
  `NotACandidatePair` (anonymous, or not the same name) — PDU-025; `MergeFailed` (nothing was
  written — PDU-024); `DatabaseError`

### `dismiss_patient_duplicate` — PDU-030, PDU-031, PDU-032

Records that the two patients are different people. Dismissing a dismissed pair is a success.

- **Args:** `first_patient_id: String`, `second_patient_id: String`
- **Returns:** `()`
- **Errors:** `SamePatient`, `PatientNotFound`, `DatabaseError` — PDU-032

---

## Shared Types

```rust
// PDU-012 — one patient of a pair
struct PatientSummary {
    id: String,
    name: String,
    ssn: Option<String>,
    procedure_count: u32,                   // procedures that are not deleted
    latest_procedure_date: Option<String>,  // "YYYY-MM-DD"
}

// PDU-010, PDU-013 — `first` is the patient preselected as the one to keep
struct DuplicatePair {
    name: String,
    first: PatientSummary,
    second: PatientSummary,
}

// Wire codes of `PatientDuplicatesError`; no payload crosses the wire
"SamePatient" | "PatientNotFound" | "NotACandidatePair" | "MergeFailed" | "DatabaseError"
```

## Events

- `PatientUpdated` and `ProcedureUpdated` after a merge (PDU-028).
- None after a dismissal (PDU-032).
