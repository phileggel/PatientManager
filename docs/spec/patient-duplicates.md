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

Two patients that each have an SSN can be merged; the other patient's SSN then stays on the deleted
patient only. A later import carrying that SSN creates a patient again, and the pair comes back.

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
of its patients (PDU-026).

---

## Business Rules

### Listing (010–019)

**PDU-010 — Candidate pair (backend)**: Two patients form a candidate pair when neither is
deleted nor anonymous, both have a name, and their names are equal once leading and trailing
spaces are removed and case and accents are ignored. A pair the user dismissed (PDU-030) is not a
candidate.

**PDU-011 — Three or more same-name patients (backend)**: Every two of them form a pair: three
patients with the same name give three pairs.

**PDU-012 — Pair content (backend)**: For each patient of a pair the list gives its SSN (or none),
the number of its procedures that are not deleted, and the date of the latest of them (or none).
The pair shows the name as recorded on the patient that comes first by PDU-013.

**PDU-013 — Order (backend)**: Pairs are ordered by name, ignoring case and accents. Within a
pair, the patient with the most procedures comes first; with equal counts, the one that has an
SSN; then by identifier, so the order is stable.

**PDU-014 — Search (frontend)**: The search field keeps the pairs whose name contains the typed
text, ignoring case and accents.

**PDU-015 — Empty and loading states (frontend)**: While the pairs load, the list shows a loading
message. With no pair to show, it shows « Aucun doublon à examiner. ». If loading fails, it shows
an error message in place of the rows.

**PDU-016 — Entry point (frontend)**: The page is opened from a « Doublons de patients » card in
the management dialog.

### Merge (020–029)

**PDU-020 — Choosing the patient to keep (frontend)**: « Fusionner » opens a dialog showing the
two patients of the pair with their SSN, procedure count and latest procedure date. The first
patient of the pair (PDU-013) is preselected as the one to keep; the user can pick the other. The
dialog states how many procedures move to the kept patient (the other patient's count, PDU-012)
and that the other patient is deleted, and that the action cannot be undone.

**PDU-021 — Merge (backend)**: Merging moves every procedure of the other patient, deleted ones
included and whatever their payment status, to the kept patient, and deletes the other patient. Deleted means hidden from every
screen and kept in the database, as for any patient deletion.

**PDU-022 — SSN on merge (backend)**: When the kept patient has no SSN and the other has one, the
kept patient takes it. When the kept patient has an SSN, it is unchanged, whatever the other's.

**PDU-023 — Tracking fields on merge (backend)**: The kept patient's tracking fields (latest
procedure date, type, fund, amount — PRO-260) become the other patient's when the other's latest
date is more recent, or when the kept patient has none and the other has one.

**PDU-024 — All or nothing (backend)**: The procedures move, the kept patient changes, the other
patient is deleted and its dismissals are removed (PDU-026) together, or none of it happens.

**PDU-025 — Refused merges (backend)**: A merge is refused, and nothing changes, when the two
identifiers are the same, when either patient does not exist or is deleted, or when the two
patients do not meet PDU-010's conditions on the patients themselves (not anonymous, same name). A
dismissal does not make a merge refused.

**PDU-026 — Dismissals of the deleted patient (backend)**: Dismissals that involve the deleted
patient are removed in the merge.

**PDU-027 — Feedback (frontend)**: While the merge runs the dialog's buttons are disabled. On
success a confirmation toast is shown, the dialog closes and the list reloads. On failure an
error toast names the cause and the dialog stays open; if the pair no longer exists the list
reloads.

**PDU-028 — Other screens after a merge (backend)**: A merge publishes `PatientUpdated` and
`ProcedureUpdated`, so every screen showing patients or procedures reflects it.

**PDU-029 — Different SSN notice (frontend)**: When both patients of the pair have an SSN and the
two differ, the merge dialog shows the notice « Ces deux fiches ont un INS différent : il s'agit
peut-être de deux personnes. L'INS de la fiche N ne sera pas conservé. », N being the patient that
is not the kept patient; it follows the choice of PDU-020. That SSN is not carried to the kept
patient and stays on the deleted patient (PDU-021, PDU-022). The merge stays allowed (PDU-025). No
notice when an SSN is missing or the two are equal.

### Dismissal (030–039)

**PDU-030 — Not a duplicate (backend)**: « Pas un doublon » records a dismissal for the pair
(Entity Definition). The pair is not proposed again, on this run or any later one.

**PDU-031 — Dismissing twice (backend)**: Dismissing a pair that is already dismissed changes
nothing and is not an error.

**PDU-032 — Refused dismissals (backend)**: A dismissal is refused when the two identifiers are
the same or when either patient does not exist or is deleted. The names are not checked: any two
existing patients can be declared different people. A dismissal publishes no event: no patient
changes.

**PDU-033 — Feedback (frontend)**: On success the pair leaves the list. On failure an error toast
names the cause.

---

## Workflow

```
management dialog → « Doublons de patients » → list of pairs
        │
        ├── « Pas un doublon » ─→ dismissal recorded ─→ the pair leaves the list (PDU-030, PDU-033)
        │
        └── « Fusionner » ─→ dialog: which patient to keep (PDU-020),
                  │             a notice if the two SSN differ (PDU-029)
                  ├── « Annuler » ─→ nothing
                  └── « Fusionner » ─→ procedures move, SSN and defaults carried, other patient
                                       deleted (PDU-021 to PDU-026) ─→ toast, list reloads (PDU-027)
```

---

## UX Draft

### Entry Point

A card « Doublons de patients » in the management dialog, after « Patients ». Validated by the
owner from mocks on 2026-10-03 (shipped screen: `screenshots/PatientDuplicateManager-*.png`).

### Main Component

The manager layout used by the other management pages: on the left the list with its search
field and pair count; on the right a panel explaining what a duplicate is and what the two
actions do. One row per pair: name, first patient (SSN, « N actes · dernier le … »), second
patient, and the actions « Pas un doublon » and « Fusionner ».

### States

- **Loading / empty / error**: one message row (PDU-015).
- **Merge dialog**: two selectable cards, the different-SSN notice when it applies (PDU-029), the
  consequence sentence, « Annuler » and a danger « Fusionner » (PDU-020). The notice was validated by
  the owner from a mock on 2026-10-04.

### User Flow

1. Open the page; read a pair.
2. Either « Pas un doublon »: the row disappears.
3. Or « Fusionner »: choose the patient to keep, confirm; the row disappears and the kept patient
   now carries all the procedures.

---

## Open Questions

- [x] What happens to the SSN when the kept patient has none? — Decided by the owner on
      2026-10-03: the kept patient takes the other's SSN (PDU-022).
- [x] What happens to the patient that is not kept? — Decided by the owner on 2026-10-03: hidden
      and kept in the database (PDU-021).
- [x] Two patients that each have an SSN? — Decided by the owner on 2026-10-03, completed on
      2026-10-04: the kept patient's SSN stays, the merge is not refused (PDU-022), and the dialog
      warns when the two differ (PDU-029).
- [x] Which pairs are proposed? — Decided by the owner on 2026-10-03: same name only (PDU-010).

None — all questions have been resolved.
