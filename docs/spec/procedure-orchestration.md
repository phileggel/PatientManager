# Business Rules — Procedure Entry (Procedure Orchestration)

## Context

The procedure-entry page is the main data-entry screen. It lets practitioners record
medical procedures month by month, via a read-only list. Procedures are created through
a modal form and edited through that same modal. Inline editing was removed in favor of
the modal workflow.

On the backend, the feature is built on `use_cases/procedure_orchestration/`, which
orchestrates the `patient`, `fund`, and `procedure` contexts: FK validation, payment
status inference, and patient tracking-field updates as side effects.

---

## Frontend rules

**PRO-010 (R1) — Period filter**: Procedures are filtered by month and year. By default, the period matches the current month and year. The selected period persists across navigations via `sessionStorage` (`procedureSelectedMonth`, `procedureSelectedYear`).

> _R2 and R3 have been removed._

**PRO-020 (R4) — Pre-fill on patient selection**: In creation mode, when a patient is selected in the modal, the fund, procedure type, and amount are pre-filled from the patient's most recent procedure (`latest_fund`, `latest_procedure_type`, `latest_procedure_amount`) only when the corresponding form field is in its not-initialized state. Today's date is also pre-filled if no date has been entered yet.

**PRO-025 — Pre-fill on procedure type selection**: In creation mode, when a procedure type is selected or changed, the amount field (`billed_amount`) is pre-filled from that type's `default_amount` only when the amount field is in its not-initialized state. Once the user has entered a value, subsequent procedure-type changes do not overwrite it. Clearing the amount field returns it to its not-initialized state, re-enabling propagation.

**PRO-030 (R5) — Confirmation before deletion**: Deleting a procedure always requires a `ConfirmationDialog`. No row can be deleted without explicit confirmation. Deletion is blocked (frontend + backend) for procedures in `Reconciliated`, `PartiallyReconciled`, `FundPayed`, `PartiallyFundPayed`, `DirectlyPayed`, `Overpaid` (see REF-220), or `OverpaymentRefund` (see REF-230) status — these procedures are tied to a fund-payment group or a direct bank transaction; deleting them would leave those records inconsistent. To delete them, you must first delete the associated transfer, fund-payment group, or direct payment. On the frontend, the delete button is `disabled` (`isBlockingStatus`) for these statuses. On the backend, `delete_procedure` checks the status before deletion and returns an explicit error.

**PRO-040 (R6) — Modal routing by status (frontend)**: A double-click on a row, or a click on the Edit button, opens the modal in the mode matching the procedure's status. Procedures whose status is non-blocking (`None`, `Created`, `ImportDirectlyPayed`, `ImportFundPayed`) open in edit mode (see PRO-050). Procedures whose deletion is blocked (`Reconciliated`, `PartiallyReconciled`, `FundPayed`, `PartiallyFundPayed`, `DirectlyPayed`, `OverpaymentRefund`) open in partial-view mode (see PRO-190). Procedures in `Overpaid` status open in a dedicated partial-edit mode (see REF-190): the `procedure_type_id` field is editable, with propagation to the linked refund (see REF-170); all other fields are read-only; the "Cancel refund" button is present.

**PRO-050 (R30) — Modal contents in edit mode (frontend)**: In edit mode, the modal pre-fills all fields from the existing procedure. Editable fields: `patient_id`, `fund_id`, `procedure_type_id`, `procedure_date`, `procedure_amount`. Patient selection happens through a ComboboxField (see PRO-150, PRO-160). Payment information (`payment_method`, `fund_reconciliation_date`, `confirmed_payment_date`, `payment_status`, `actual_payment_amount`) is not displayed — those fields are edited exclusively through the management of bank transfers and transactions. The procedure's technical id is not displayed. While saving, the button is disabled and shows a loading indicator; after a successful save, the modal closes and a success snackbar is displayed; on backend or network error, the modal stays open and an error snackbar is displayed.

**PRO-060 (R7) — Aggregate statistics**: The header bar displays aggregate statistics for the filtered rows (period + search): unique patient count, procedure count, billed total (`procedureAmount`), received total (`actualPaymentAmount`), and awaited total (`max(0, procedureAmount − actualPaymentAmount)` per row). Draft rows (procedures with `isDraft` true, i.e. procedures being entered for the active period) are excluded from all statistics.

**PRO-070 (R8) — Refresh on event**: When the backend emits a `procedure_updated` event (relayed by
`useCacheSync`), the procedure list is refreshed automatically. Reload failures must be
logged and surfaced to the user via a toast.

**PRO-080 (R9) — Inline patient creation (frontend)**: From the patient field **in creation mode only**, the practitioner can create a new patient without closing the modal. The creation form appears in a nested modal; on validation, the new patient is automatically selected. This feature is not available in edit mode.

**PRO-090 (R10) — Status badge**: Each procedure's payment status is displayed as a colored badge.
M3 token mapping:

- `NONE` → `bg-m3-surface-container-high` / `text-m3-on-surface-variant`
- `CREATED` → `bg-m3-secondary-container` / `text-m3-on-secondary-container`
- `RECONCILIATED`, `PARTIALLY_RECONCILED` → `bg-m3-tertiary-container` / `text-m3-on-tertiary-container`
- `DIRECTLY_PAYED`, `FUND_PAYED`, `PARTIALLY_FUND_PAYED`, `IMPORT_DIRECTLY_PAYED`, `IMPORT_FUND_PAYED` →
  `bg-m3-primary-container` / `text-m3-on-primary-container`

> **Note on `NONE`**: this status is the default initial value of the Rust domain model. It is never assigned by this feature at creation (see PRO-230 — the minimum assigned is `Created`). It can appear on legacy data predating the formalization of the status lifecycle. A `NONE` procedure is treated as eligible for deletion and editing.

**PRO-100 (R11) — Search filter**: A free-text search filters the period's rows by patient name, procedure name, fund name, or social-security number (SSN). This filter and the status filter (PRO-180) are applied cumulatively.

**PRO-110 (R12) — FAB to create**: A Floating Action Button (FAB, bottom-right, 56×56 px,
`rounded-full`) opens `ProcedureFormModal` in creation mode. The table occupies the full
content width.

**PRO-120 (R27) — Form validation (frontend)**: Three fields are required to submit the create or edit form: the patient (`patient_id`), the procedure type (`procedure_type_id`), and the execution date (`procedure_date`). An error message is shown for each missing field and a global error toast is triggered. The fund (`fund_id`) is optional. The amount (`billed_amount`) is a mandatory domain field stored as a non-null integer in thousandths of a euro; the form displays an empty input box when the field has not been initialized by the user nor by propagation (PRO-020, PRO-025), in which case the submitted value is `0`.

**PRO-130 (R28) — SSN display format (frontend)**: When the patient's social-security number (SSN — `ssn` field) is set, it is displayed in parentheses immediately after the patient's name. Example: `DUPOND Floriane (1234567890123)`. If the patient has no SSN, the parentheses and their content are omitted.

**PRO-140 (R31) — Contexts where the SSN format applies (frontend)**: The format defined in PRO-130 applies in three contexts: the dropdown items of the patient ComboboxField (see PRO-150), the displayed value in the ComboboxField after selection, and the read-only patient display in the partial-view modal (see PRO-190).

**PRO-150 (R29) — Patient search via ComboboxField (frontend)**: The patient field in creation mode and edit mode is a text-search ComboboxField. Typing filters the patient list in real time by name or by SSN. Each entry displays the patient using the PRO-130 format. When the search returns no result, a neutral message is displayed.

**PRO-160 (R32) — ComboboxField behavior by mode (frontend)**: In creation mode, the inline patient-creation button (see PRO-080) remains visible even when the search returns no result. In edit mode, the ComboboxField is pre-positioned on the patient of the existing procedure, displayed using the PRO-130 format; when the search returns no result, only the neutral message is shown (see PRO-150) — no creation button is present.

**PRO-170 (R24) — List sort**: The procedure list has no default sort. The user can trigger sorting on the following columns: patient name, procedure date, billed amount, status. Each column follows a three-state cycle: ascending → descending → no sort. Only one sort is active at a time.

**PRO-180 (R25) — Status filter**: A dedicated selector restricts the display to a specific payment status. This filter is independent of the text search (PRO-100); both filters are applied cumulatively to the rows of the period.

**PRO-190 (R26) — Partial view (blocking-status procedures)**: Procedures whose deletion is blocked (see PRO-030 — statuses `Reconciliated`, `PartiallyReconciled`, `FundPayed`, `PartiallyFundPayed`, `DirectlyPayed`, `OverpaymentRefund`) open in a partial-view modal (mode="view"). The `procedure_type_id` field stays editable; all other fields are displayed read-only. Read-only fields displayed: the patient's name (with SSN in parentheses if set, see PRO-130), the procedure date, the billed amount, and the fund. Payment information is not displayed. The procedure's technical id is not displayed. A save button is present so that the procedure type can be edited; while saving, it is disabled and shows a loading indicator; after a successful save, the modal closes and a success snackbar is displayed; on backend or network error, the modal stays open and an error snackbar is displayed. The delete button is absent or disabled.

---

## Backend rules

**PRO-200 (R13) — Mandatory-field validation**: A procedure requires a non-empty `patient_id`,
`procedure_type_id`, and `procedure_date`. Both date fields (`procedure_date`,
`confirmed_payment_date`) must be in ISO 8601 format (YYYY-MM-DD); an invalid format is
rejected when the domain object is constructed. `fund_id` is optional.

**PRO-210 (R14) — FK existence validation at creation**: Before persistence, the orchestration
checks that `patient_id` and `procedure_type_id` reference existing entities. If
`fund_id` is provided, the fund must also exist. Any missing reference aborts creation
with an error.

**PRO-220 (R15) — Payment-method inference at creation**: At creation or import only, `payment_method` is determined from the raw data. When created via the frontend form, the `add_procedure` command exposes neither the `payment_method` nor the `confirmed_payment_date` parameter — the method is therefore always `None` and the initial status is always `Created` (see PRO-230). At Excel import, the codes from column `T` are translated: code `"ES"` → `Cash`; code `"CH"` → `Check`; date present + any other code or absent → `BankTransfer`. After creation, `payment_method` is updated atomically by the reconciliation use cases (see dedicated specs) via the `update_procedure` command (PRO-250) — it is not exposed in the edit form (see PRO-040).

**PRO-230 (R16) — Initial status determination**: The status is computed by the orchestration,
never accepted as-is from the caller. A procedure is "paid" if (`confirmed_payment_date`
is present AND `actual_payment_amount > 0`) OR (`actual_payment_amount >= procedure_amount`).
Unpaid → `Created`. Paid + (ES/CH method OR no fund) → `ImportDirectlyPayed`. Paid +
non-ES/CH method + fund present → `ImportFundPayed`. `None` is never assigned at creation.

**PRO-240 (R17) — `awaited_amount` ignored**: The `awaited_amount` value sent by the caller is
always ignored and never persisted.

**PRO-250 (R18) — Free updates from the frontend (backend)**: The `update_procedure` command accepts every procedure field (`patient_id`, `fund_id`, `procedure_type_id`, `procedure_date`, `procedure_amount`, `payment_method`, `fund_reconciliation_date`, `confirmed_payment_date`, `actual_payment_amount`, `payment_status`) without re-inference. No FK validation is performed on update — a deliberate choice: an update from the frontend is a direct-correction operation, and the frontend is responsible for the values sent. The backend imposes no restriction on which fields are editable based on the procedure's status (including blocking statuses) — the restriction to `procedure_type_id` only for blocking-status procedures is guaranteed exclusively by the frontend (see PRO-190).

**PRO-260 (R19) — Patient tracking on creation**: After a successful creation (single or batch), if
`procedure_date > patient.latest_date` (or `latest_date` is null), the orchestration
updates the patient's tracking fields: `latest_date`, `latest_procedure_type`,
`latest_fund`, `latest_procedure_amount`. In batch mode, the most recent procedure of the
batch is identified per patient and a single update is applied per patient. If the new
procedure has no fund (`fund_id` absent — direct-payment procedure), `latest_fund` must be
cleared to reflect that the latest known procedure is no longer linked to a fund.

> **Known limitation**: the current implementation only updates `latest_fund` when
> `fund_id` is present — it does not clear it when the most recent procedure has no fund.
> This behavior is to be fixed (see `docs/todo.md`).

**PRO-270 (R20) — Patient tracking on deletion**: After a procedure is deleted, if the patient has no remaining procedures and `latest_date` is set, the four tracking fields are cleared. Known limitation: if the deleted procedure was the most recent but the patient has other procedures, the tracking fields are not recomputed — they keep their old values until a more recent procedure is created.

**PRO-280 (R21) — Cascading clear on procedure-type deletion**: When a procedure type is deleted,
any patient whose `latest_procedure_type` references this type has
`latest_procedure_type` and `latest_date` cleared.

**PRO-290 (R22) — Cascading clear on fund deletion**: When a fund is deleted, any patient whose
`latest_fund` references this fund has `latest_fund` cleared.

**PRO-300 (R23) — Batch creation: single transaction and single event**: `create_batch` persists
all procedures in a single transaction and publishes exactly one `ProcedureUpdated`
event, regardless of batch size.

---

## Status lifecycle

This feature is responsible for procedure **creation** only. Subsequent status transitions are managed by other features.

### Statuses created by this feature

| Initial status        | Condition                                       | Trigger                       |
| --------------------- | ----------------------------------------------- | ----------------------------- |
| `Created`             | Procedure with no confirmed payment             | Frontend form or Excel import |
| `ImportDirectlyPayed` | Confirmed payment + ES/CH method or no fund     | Excel import only             |
| `ImportFundPayed`     | Confirmed payment + other method + fund present | Excel import only             |

### Transitions handled by other features

| From                               | To                                              | Owner feature                                               |
| ---------------------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| `Created`                          | `Reconciliated` / `PartiallyReconciled`         | fund-payment-auto-match, fund-payment-manual-match          |
| `Created`                          | `DirectlyPayed`                                 | bank-statement-manual-match                                 |
| `Reconciliated`                    | `FundPayed`                                     | bank-statement-auto-match, bank-statement-manual-match      |
| `PartiallyReconciled`              | `PartiallyFundPayed`                            | bank-statement-auto-match, bank-statement-manual-match      |
| `FundPayed`                        | → `Reconciliated` (rollback)                    | Transfer deletion — bank-statement-manual-match (R8)        |
| `PartiallyFundPayed`               | → `PartiallyReconciled` (rollback)              | Transfer deletion — bank-statement-manual-match (R8)        |
| `DirectlyPayed`                    | → `Created` (rollback)                          | Direct-payment deletion — bank-statement-manual-match (R16) |
| `FundPayed` / `PartiallyFundPayed` | `Overpaid`                                      | Refund recording — overpayment (REF-160)                    |
| `Overpaid`                         | → `FundPayed` / `PartiallyFundPayed` (rollback) | Refund cancellation — overpayment (REF-210)                 |

### Allowed actions per status (this feature)

| Status                | Deletion                | Edit                                                                            |
| --------------------- | ----------------------- | ------------------------------------------------------------------------------- |
| `None`                | yes (with confirmation) | yes                                                                             |
| `Created`             | yes (with confirmation) | yes                                                                             |
| `ImportDirectlyPayed` | yes (with confirmation) | yes                                                                             |
| `ImportFundPayed`     | yes (with confirmation) | yes                                                                             |
| `DirectlyPayed`       | no — blocked            | partial — procedure type only (PRO-190)                                         |
| `Reconciliated`       | no — blocked            | partial — procedure type only (PRO-190)                                         |
| `PartiallyReconciled` | no — blocked            | partial — procedure type only (PRO-190)                                         |
| `FundPayed`           | no — blocked            | partial — procedure type only (PRO-190)                                         |
| `PartiallyFundPayed`  | no — blocked            | partial — procedure type only (PRO-190)                                         |
| `Overpaid`            | no — blocked (REF-220)  | partial — procedure type only with propagation to the refund (REF-190, REF-170) |
| `OverpaymentRefund`   | no — blocked (REF-230)  | no — read-only (REF-200)                                                        |

---

## Component structure

```
procedure/
  api/
    gateway.ts                        — all Tauri calls for the feature
    procedureService.ts               — high-level service (multi-step operations)
  hooks/
    useProcedureData.ts               — loads patients/funds/types; exposes deleteRow
    useProcedurePeriod.ts             — filters by selected month/year; derives yearRange
    useCreateEntityForm.ts            — generic hook for create-patient / create-fund forms
  model/
    procedure-row.types.ts            — ProcedureRow interface (UI representation)
    procedure-row.mapper.ts           — Procedure → ProcedureRow (amounts: thousandths → euros)
    date.logic.ts                     — getMonthName, formatDateDisplay, period helpers
    index.ts                          — re-exports
  ui/
    ProcedurePage.tsx                 — main page (period selector, search, stats, list, FAB, modal)
    PeriodSelector.tsx                — CompactSelectField month/year dropdowns + navigation arrows
    SummaryStats.tsx                  — aggregated stats bar (patients, procedures, billed, received, awaited)
    ui.styles.ts                      — shared TABLE_STYLES / COL_WIDTHS constants
    procedure_list/
      ProcedureList.tsx               — read-only table (all rows of the filtered period)
      StatusBadge.tsx                 — colored payment-status badge
    procedure_form_modal/
      ProcedureFormModal.tsx          — unified create/edit modal (mode prop)
      useProcedureFormModal.ts        — form state, validation, pre-fill (PRO-020), gateway calls
    form/
      CreatePatientForm.tsx           — nested modal for inline patient creation (PRO-080)
```
