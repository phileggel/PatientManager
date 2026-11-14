# Business Rules — Procedure Orchestration (PRO)

## Context

Practitioners record medical procedures, one per service rendered to a patient, and edit or
delete them while no payment ties them. The use case orchestrates the `patient`, `fund` and
`procedure` contexts: reference checks, payment status inference, and the patients' tracking
fields as side effects. The screens are described by their validated mocks
(`docs/workflow.md` § Design).

---

## Entity Definition

### Procedure

A healthcare procedure rendered to one patient, with its billing and payment state.

| Field                      | Business meaning                                                   |
| -------------------------- | ------------------------------------------------------------------ |
| `patient_id`               | The patient the procedure was rendered to                          |
| `fund_id`                  | The fund that pays it, if any; none for a patient's direct payment |
| `procedure_type_id`        | What kind of procedure it is                                       |
| `procedure_date`           | When it was rendered                                               |
| `billed_amount`            | What was invoiced to the fund or patient                           |
| `paid_amount`              | What was actually received; may differ from `billed_amount`        |
| `payment_method`           | How it was paid                                                    |
| `fund_reconciliation_date` | When a fund's payment statement matched it (stage 1)               |
| `confirmed_payment_date`   | When its payment reached the bank (stage 2)                        |
| `payment_status`           | Where it stands in its payment lifecycle (§ Status lifecycle)      |

---

## Business Rules

### Creation and validation

**PRO-200 (R13) — Mandatory-field validation (backend)**: A procedure requires a non-empty `patient_id`,
`procedure_type_id`, and `procedure_date`. Both date fields (`procedure_date`,
`confirmed_payment_date`) must be in ISO 8601 format (YYYY-MM-DD); a malformed one is
refused with a specific error. `fund_id` is optional.

**PRO-125 — Required fields refused at once (backend)**: Creating a single procedure, or editing one, whose patient, procedure type or date is empty (a blank value counts as empty), or whose date is not a valid YYYY-MM-DD date, is refused naming every such field at once, one reason per field (an empty date and a malformed date are two different reasons); nothing is saved. Batch creation (PRO-300) is not covered.

**PRO-210 (R14) — Reference existence at creation (backend)**: Before anything is saved, the
creation checks that `patient_id` and `procedure_type_id` reference existing entities. If
`fund_id` is provided, the fund must also exist. Any missing reference refuses the creation
with a specific error.

**PRO-220 (R15) — Payment-method inference at creation (backend)**: At creation or import only, `payment_method` is determined from the raw data. A single creation carries neither a payment method nor a confirmed payment date — the method is therefore always `None` and the initial status always `Created` (see PRO-230). At Excel import, the codes from column `T` are translated: code `"ES"` → `Cash`; code `"CH"` → `Check`; date present + any other code or absent → `BankTransfer`. After creation, `payment_method` is changed by the reconciliation use cases (see their specs).

**PRO-230 (R16) — Initial status determination (backend)**: The status is computed at creation,
never taken as sent. A procedure is "paid" if (`confirmed_payment_date`
is present AND `paid_amount > 0`) OR (`paid_amount >= billed_amount`).
Unpaid → `Created`. Paid + (ES/CH method OR no fund) → `ImportDirectlyPaid`. Paid +
non-ES/CH method + fund present → `ImportFundPaid`. `None` is never assigned at creation. A single creation publishes `ProcedureUpdated`; a batch follows PRO-300.

**PRO-240 (R17) — Awaited amount ignored (backend)**: An imported row's awaited amount is ignored and
never stored.

**PRO-300 (R23) — Batch creation: single transaction and at most one event (backend)**: A
batch of procedures (the Excel import, EXI-175) is persisted in a single transaction and
raises at most one `ProcedureUpdated` event, regardless of batch size (EXI-177).

### Edit

**PRO-250 (R18) — Updates without re-inference (backend)**: An edit takes every procedure field (`patient_id`, `fund_id`, `procedure_type_id`, `procedure_date`, `billed_amount`, `payment_method`, `fund_reconciliation_date`, `confirmed_payment_date`, `paid_amount`, `payment_status`) as sent, without re-inference, within PRO-190's restriction. References are checked as PRO-251 says.

**PRO-190 (R26) — A paid procedure changes its type only (backend)**: An edit of a procedure whose stored status is blocking (PRO-030A) that changes anything but its procedure type is refused with a specific error, and nothing is saved; an `Overpaid` procedure's type change reaches its refund (REF-170). A procedure in `OverpaymentRefund` status follows REF-200 (owner, 2026-11-14, #646).

**PRO-251 — References checked on edit (backend)**: An edit that changes the patient, the procedure type or the fund to one that does not exist is refused, naming the first one found in the order patient, procedure type, fund; nothing is saved. A reference the edit keeps stays valid (owner, 2026-10-18: the backend judges what it receives, whoever sends it); a procedure type, a fund or a patient in use cannot be deleted (R24 of the procedure-type spec, PRO-291, PRO-296).

**PRO-252 — Unknown procedure (backend)**: An edit of a procedure that does not exist is refused; nothing is saved.

**PRO-255 — An edit that changes nothing (backend)**: An edit whose values, as the domain reads them, all equal the stored procedure's saves nothing, publishes no `ProcedureUpdated` event, and is reported as unchanged; any other edit is saved, publishes `ProcedureUpdated`, and is reported with the saved procedure.

**PRO-256 — Order of refusals (backend)**: On an edit, PRO-125 is checked first, then PRO-252, then PRO-251; PRO-255 applies only to an edit none of them refuses. On a creation, PRO-125 is checked before PRO-210.

### Deletion

**PRO-030 (R5) — Deletion (backend)**: Deleting a procedure nothing ties removes it and is signaled through the `ProcedureUpdated` event.

**PRO-030A — A paid procedure is kept (backend)**: Deleting a procedure in a blocking status — `Reconciled`, `PartiallyReconciled`, `FundPaid`, `PartiallyFundPaid`, `DirectlyPaid`, `Overpaid` (see REF-220) or `OverpaymentRefund` (see REF-230) — is refused with a specific error, and nothing changes. To delete it, its payment is removed first.

**PRO-030B — A procedure a payment record names is kept (backend)**: Whatever its status, deleting a procedure that a fund payment line, a bank entry or a refund record still refers to is refused with a specific error, and nothing changes.

**PRO-030C — An unknown procedure (backend)**: Deleting a procedure that does not exist, an already deleted one included, is refused with a specific error, and nothing changes.

**PRO-031 — Deleted procedures removed on upgrade (backend)**: Procedures deleted before deletion was real, hidden but kept, are removed when the application is upgraded, unless a fund payment line, a bank entry or a refund record still refers to one (PRO-032). The upgrade does not recompute the patients' tracking fields (owner, 2026-11-01, #579).

**PRO-032 — A deleted procedure still referred to comes back (backend)**: A procedure PRO-031 keeps, because a payment record still refers to it, is listed again as it was stored: its status, its patient, its type and its fund (owner, 2026-11-01, #579).

### Patient tracking

**PRO-260 (R19) — Patient tracking on creation (backend)**: After a successful creation (single or batch), if
`procedure_date > patient.latest_date` (or `latest_date` is null), the patient's tracking
fields are updated: `latest_date`, `latest_procedure_type`, `latest_fund`,
`latest_procedure_amount`. In batch mode, the most recent procedure of the batch is
identified per patient and a single update is applied per patient. If the new procedure has
no fund (a direct-payment procedure), `latest_fund` is cleared.

**PRO-270 (R20) — Patient tracking on deletion (backend)**: After a procedure is deleted, the patient's four tracking fields follow their most recent remaining procedure; with none left, they are cleared.

**PRO-280 (R21) — Cascading clear on procedure-type deletion (backend)**: When a procedure type is deleted,
any patient whose `latest_procedure_type` references this type has
`latest_procedure_type` and `latest_date` cleared.

**PRO-290 (R22) — Cascading clear on fund deletion (backend)**: When a fund is deleted, any patient whose
`latest_fund` references this fund has `latest_fund` cleared.

### Funds and patients in use

**PRO-291 — A fund in use is kept (backend)**: Deleting a fund that procedures or fund payment groups still use is refused with a specific error carrying the number of each; nothing changes (owner, 2026-11-01, #579). A procedure or a fund payment recorded at the same moment as the deletion still keeps the fund, with the same refusal.

**PRO-292 — An unused fund is removed (backend)**: Deleting a fund nothing uses removes it, atomically with PRO-290, and is signaled through the `FundUpdated` event; its identifier can be used again. Its bank statement labels stay and are treated as unknown (BAS-041D) (owner, 2026-11-08, #590).

**PRO-293 — An unknown fund (backend)**: Deleting a fund that does not exist changes no data and is not an error; the `FundUpdated` event is still raised.

**PRO-294 — Deleted funds removed on upgrade (backend)**: Funds deleted before deletion was real, hidden but kept, are removed when the application is upgraded, once the deleted procedures (PRO-031) and fund payment groups (FPM-401) are removed; the patients' defaults naming them are cleared as PRO-290 says, and their bank statement labels are treated as unknown (BAS-041D). A fund a procedure or a fund payment group still uses is kept (PRO-295) (owner, 2026-11-01, #579).

**PRO-295 — A deleted fund still used comes back (backend)**: A fund PRO-294 keeps is listed again as it was stored, except that an identifier another fund holds becomes `{identifier} (restauré {first 8 characters of its id})`, stored as data, never translated, so identifiers stay unique (owner, 2026-11-01, #579: the real database held none).

**PRO-296 — A patient with procedures is kept (backend)**: Deleting a patient that procedures name, whatever their payment status, is refused with a specific error carrying the number of those procedures; nothing changes, so a paid procedure never goes with its patient. A procedure recorded at the same moment as the deletion still keeps the patient, with the same refusal (owner, 2026-11-01, #579).

**PRO-297 — A patient without procedures is removed (backend)**: Deleting a patient no procedure names removes it, its name and SSN included, together with its duplicate dismissals (PDU-030), atomically, and is signaled through the `PatientUpdated` event (#591).

**PRO-298 — An unknown patient (backend)**: Deleting a patient that does not exist changes no data and is not an error; the `PatientUpdated` event is still raised.

**PRO-299 — Deleted patients removed on upgrade (backend)**: Patients deleted before deletion was real, hidden but kept, are removed with their duplicate dismissals when the application is upgraded, once the deleted procedures are removed (PRO-031). A patient a procedure still names comes back as it was stored (owner, 2026-11-01, #579: the real database held none).

### Listing, statistics and overdue

**PRO-170 (R24) — Default order (backend)**: The procedures are listed by procedure date, ascending.

**PRO-060 (R7) — Statistics (backend)**: The statistics of a set of procedures are: the number of distinct patients, the number of procedures, the billed total (Σ `billed_amount`), the received total (Σ `paid_amount`) and the awaited total (Σ `max(0, billed_amount − paid_amount)` per procedure).

**PRO-310 — Overdue (backend)**: A procedure is **overdue** when its `payment_status` is `Created` **and** its `procedure_date` is strictly earlier than the **reconciliation high-water mark** — the most recent `procedure_date` among all fund-reconciled procedures (`Reconciled`, `PartiallyReconciled`, `FundPaid`, `PartiallyFundPaid`, `ImportFundPaid`). The high-water mark is **global**: it is never scoped by patient or fund, and direct payments (`DirectlyPaid`, `ImportDirectlyPaid`) never contribute to it. Overdue is derived, never stored, and is not a `ProcedureStatus`: the procedure stays `Created` for every other purpose (reconciliation eligibility, deletion, editing). When no fund-reconciled procedure exists, nothing is overdue. A reverted reconciliation lowers the mark and the overdue set follows. `Overpaid` and `OverpaymentRefund` are deliberately excluded from the contributors — the former is a rare terminal overpayment end-state, the latter a synthetic mirror procedure, so neither defines the normal fund-payment frontier.

---

## Status lifecycle

This feature sets a procedure's **initial** status; the transitions after it are managed by other features.

> **`Overdue` is not part of this lifecycle.** It is derived over `Created` (PRO-310), not a persisted status.
>
> **`None`** is the default initial value of the domain model. It is never assigned at creation (PRO-230 — the minimum assigned is `Created`). It can appear on legacy data predating the status lifecycle; a `None` procedure can be deleted and edited.

### Statuses created by this feature

| Initial status       | Condition                                       | Trigger                         |
| -------------------- | ----------------------------------------------- | ------------------------------- |
| `Created`            | Procedure with no confirmed payment             | Single creation or Excel import |
| `ImportDirectlyPaid` | Confirmed payment + ES/CH method or no fund     | Excel import only               |
| `ImportFundPaid`     | Confirmed payment + other method + fund present | Excel import only               |

### Transitions handled by other features

| From                             | To                                            | Owner feature                                               |
| -------------------------------- | --------------------------------------------- | ----------------------------------------------------------- |
| `Created`                        | `Reconciled` / `PartiallyReconciled`          | fund-payment-auto-match, fund-payment-manual-match          |
| `Created`                        | `DirectlyPaid`                                | bank-statement-manual-match                                 |
| `Reconciled`                     | `FundPaid`                                    | bank-statement-auto-match, bank-statement-manual-match      |
| `PartiallyReconciled`            | `PartiallyFundPaid`                           | bank-statement-auto-match, bank-statement-manual-match      |
| `FundPaid`                       | → `Reconciled` (rollback)                     | Transfer deletion — bank-statement-manual-match (R8)        |
| `PartiallyFundPaid`              | → `PartiallyReconciled` (rollback)            | Transfer deletion — bank-statement-manual-match (R8)        |
| `DirectlyPaid`                   | → `Created` (rollback)                        | Direct-payment deletion — bank-statement-manual-match (R16) |
| `FundPaid` / `PartiallyFundPaid` | `Overpaid`                                    | Refund recording — overpayment (REF-160)                    |
| `Overpaid`                       | → `FundPaid` / `PartiallyFundPaid` (rollback) | Refund cancellation — overpayment (REF-210)                 |

### Allowed actions per status (this feature)

| Status                | Deletion               | Edit                                               |
| --------------------- | ---------------------- | -------------------------------------------------- |
| `None`                | yes                    | yes                                                |
| `Created`             | yes                    | yes                                                |
| `ImportDirectlyPaid`  | yes                    | yes                                                |
| `ImportFundPaid`      | yes                    | yes                                                |
| `DirectlyPaid`        | no — blocked           | procedure type only (PRO-190)                      |
| `Reconciled`          | no — blocked           | procedure type only (PRO-190)                      |
| `PartiallyReconciled` | no — blocked           | procedure type only (PRO-190)                      |
| `FundPaid`            | no — blocked           | procedure type only (PRO-190)                      |
| `PartiallyFundPaid`   | no — blocked           | procedure type only (PRO-190)                      |
| `Overpaid`            | no — blocked (REF-220) | procedure type only, reaching the refund (REF-170) |
| `OverpaymentRefund`   | no — blocked (REF-230) | no (REF-200)                                       |

Whatever the status, a deletion is refused while a fund payment line, a bank entry or a refund record still refers to the procedure (PRO-030B).

---

## Open Questions

- [ ] PRO-060: the code counts a procedure with a paid status but no `paid_amount` as received in full — #379, with the owner.
- [ ] PRO-230: the code has a positive-billed-amount guard the rule does not state — #379, with the owner.
- [ ] PRO-250: an edit takes `payment_status` and the payment fields as sent, so it can move a procedure that is not blocked to any status, past the transitions other features own — #379, with the owner.
- [ ] `billed_amount`: whether zero or a negative amount is refused, at creation and on edit (the code checks neither).
- [ ] Patient tracking on edit: an edit that changes the date, patient, type, fund or amount moves no tracking field today (PRO-260, PRO-270 cover creation and deletion).
- [ ] PRO-256: where PRO-190's refusal sits in the order — #379.
- [ ] PRO-170: the order of procedures of the same date — #427.
- [ ] PRO-260, PRO-270: whether a refund procedure's creation (REF-090) and cancellation (REF-210) move the patient's tracking fields; today neither does.
- [ ] PRO-060: which set of procedures the statistics take — decided with #427's API shape (owner, 2026-11-14).
