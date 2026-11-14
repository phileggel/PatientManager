# Business Rules — Patient Duplicates (PDU)

## Context

The same person can end up recorded as two patients: an import creates a patient without SSN
beside one that has it, or a name is typed twice. Their procedures are then split between two
records. This feature lists the patients that look like duplicates and lets the user merge each
pair, or declare that the two are different people.

A pair is proposed when two patients carry the same name. Similar names (typos, swapped first
and last name), splitting a patient that was wrongly merged and taking back a dismissal are out of
scope. The SSN is shown on screen as « INS ».

The comparison ignores accents; the Excel import's own name match (EXI-080) does not, so an import
can create "Elodie" beside "Élodie" and this page then proposes the pair. That is intended.

Two patients that each have an SSN can be merged; the other patient's SSN then leaves the
database with that patient. A later import carrying that SSN creates a patient again, and the pair comes back.

---

## Entity Definition

### Patient duplicate dismissal

The user's statement that two patients with the same name are different people.

| Field          | Business meaning        |
| -------------- | ----------------------- |
| First patient  | One of the two patients |
| Second patient | The other patient       |

A dismissal has no direction: (A, B) and (B, A) are the same dismissal, and a pair has at most one.
It belongs to the patient context and has no life of its own: recorded once, removed only with one
of its patients (PDU-026, PRO-297, PRO-299).

---

## Business Rules

### Listing (010–019)

**PDU-010 — Candidate pair (backend)**: Two patients form a candidate pair when neither is
anonymous, both have a name, and their names are equal once leading and trailing
spaces are removed and case and accents are ignored. A pair the user dismissed (PDU-030) is not a
candidate.

**PDU-011 — Three or more same-name patients (backend)**: Every two of them form a pair: three
patients with the same name give three pairs.

**PDU-012 — Pair content (backend)**: For each patient of a pair the list gives its SSN (or none),
the number of its procedures, and the date of the latest of them (or none).
The pair shows the name as recorded on the patient that comes first by PDU-013.

**PDU-013 — Order (backend)**: Pairs are ordered by name, ignoring case and accents. Within a
pair, the patient with the most procedures comes first; with equal counts, the one that has an
SSN; then by identifier, so the order is stable.

### Merge (020–029)

**PDU-021 — Merge (backend)**: A merge names the patient to keep and the other; it moves every procedure of the other patient, whatever their
payment status, to the kept patient, and deletes the other patient: it is removed, its name and SSN
included, as for any patient deletion (PRO-297) (#591).

**PDU-022 — SSN on merge (backend)**: When the kept patient has no SSN and the other has one, the
kept patient takes it. When the kept patient has an SSN, it is unchanged, whatever the other's.

**PDU-023 — Tracking fields on merge (backend)**: The kept patient's tracking fields (latest
procedure date, type, fund, amount — PRO-260) become the other patient's when the other's latest
date is more recent, or when the kept patient has none and the other has one.

**PDU-024 — All or nothing (backend)**: The procedures move, the kept patient changes, the other
patient is deleted and its dismissals are removed (PDU-026) together, or none of it happens.

**PDU-025 — Refused merges (backend)**: A merge is refused, and nothing changes, when the two
identifiers are the same, when either patient does not exist, or when the two
patients do not meet PDU-010's conditions on the patients themselves (not anonymous, same name). A
dismissal does not make a merge refused.

**PDU-026 — Dismissals of the deleted patient (backend)**: Dismissals that involve the deleted
patient are removed in the merge.

**PDU-028 — Events of a merge (backend)**: A merge publishes `PatientUpdated` and
`ProcedureUpdated`.

### Dismissal (030–039)

**PDU-030 — Not a duplicate (backend)**: Dismissing a pair records a dismissal for it
(Entity Definition). The pair is not proposed again, on this run or any later one.

**PDU-031 — Dismissing twice (backend)**: Dismissing a pair that is already dismissed changes
nothing and is not an error.

**PDU-032 — Refused dismissals (backend)**: A dismissal is refused when the two identifiers are
the same or when either patient does not exist. The names are not checked: any two
existing patients can be declared different people. A dismissal publishes no event: no patient
changes.

---

## Workflow

```
the pairs (PDU-010 to PDU-013)
        │
        ├── dismissal ─→ recorded, the pair is not proposed again (PDU-030 to PDU-032)
        │
        └── merge, naming the patient to keep ─→ procedures move, SSN and tracking fields carried,
                                                  the other patient deleted (PDU-021 to PDU-026),
                                                  events published (PDU-028)
```

---

## Open Questions

- [x] What happens to the SSN when the kept patient has none? — Decided by the owner on
      2026-10-03: the kept patient takes the other's SSN (PDU-022).
- [x] What happens to the patient that is not kept? — Decided by the owner on 2026-10-03: hidden
      and kept in the database; superseded by the owner on 2026-11-01 (#579): really deleted
      (PDU-021, #591).
- [x] Two patients that each have an SSN? — Decided by the owner on 2026-10-03, completed on
      2026-10-04: the kept patient's SSN stays, the merge is not refused (PDU-022), and the screen
      warns when the two differ (its mock).
- [x] Which pairs are proposed? — Decided by the owner on 2026-10-03: same name only (PDU-010).

None — all questions have been resolved.
