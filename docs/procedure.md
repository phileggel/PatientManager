# Business Rules — Procedure Page

## Context

The procedure page is the main data-entry screen. It lets practitioners record care acts
(procedures) month by month, using an inline table workflow. Procedures can also be edited
via a modal and deleted with a confirmation step.

---

## Frontend Rules

**R1 — Period selection** : Procedures are filtered by month and year. The selected month/year
persists across page navigation via `sessionStorage` (`procedureSelectedMonth`,
`procedureSelectedYear`).

**R2 — Auto blank row** : The table always ends with one draft (unsaved) row. If the table is
empty, or after a row is committed, a new draft row is added automatically.

**R3 — Inline workflow states** : Each row follows a three-state lifecycle:
- `IDLE` — row is read-only, clicking a cell enters EDITING
- `EDITING` — cells are interactive editors (autocomplete, amount, date)
- `SAVING` — row is opaque + pointer-events disabled while the API call is in flight

**R4 — Auto-fill on patient selection** : When a patient is selected, fund, procedure type,
and amount are pre-filled from the patient's latest recorded procedure (`latest_fund`,
`latest_procedure_type`, `latest_procedure_amount`).

**R5 — Delete confirmation** : Deleting a procedure always requires a `ConfirmationDialog`.
No row may be deleted without explicit user confirmation.

**R6 — Edit via modal** : Saved (non-draft) procedures can be edited in `ProcedureFormModal` (mode="edit").
While the modal is open for a row, inline editing of that row is disabled.

**R7 — Summary stats** : The header bar shows aggregated stats for the currently filtered rows
(period + search): unique patient count, procedure count, total billed, received, and awaited.
Draft rows are excluded from all stats.

**R8 — Procedure update events** : When the backend emits a `procedure_updated` window event
(relayed by `useAppInit`), the procedure list is refreshed automatically. Reload failures
must be logged and shown to the user via a toast.

**R9 — Inline entity creation** : From an autocomplete cell, a practitioner can create a new
patient or fund without leaving the table. The creation form appears in a modal; on success,
the new entity is selected in the current row.

**R10 — Status badge** : The payment status of each procedure is displayed as a colour-coded
badge. Statuses and their M3 token mapping:
- `NONE` → `bg-m3-surface-container-high` / `text-m3-on-surface-variant`
- `CREATED` → `bg-m3-secondary-container` / `text-m3-on-secondary-container`
- `RECONCILIATED` → `bg-m3-tertiary-container` / `text-m3-on-tertiary-container`
- `DIRECTLY_PAYED`, `FUND_PAYED`, `IMPORT_DIRECTLY_PAYED`, `IMPORT_FUND_PAYED` →
  `bg-m3-primary-container` / `text-m3-on-primary-container`

**R11 — Search filter** : A free-text search filters the period rows by patient name or status.
Draft rows always pass the filter (they are always shown).

---

**R12 — FAB to create** : A Floating Action Button (FAB, bottom-right, 56×56 px) opens
`ProcedureFormModal` in create mode. The right sidebar panel (`AddProcedurePanel`) no longer
exists; the table takes the full content width.

---

## Component Structure

```
procedure/
  ui/
    ProcedurePage.tsx               — main page (period selector, search, stats, table, FAB, modal)
    PeriodSelector.tsx              — month/year dropdowns + navigation arrows
    SummaryStats.tsx                — aggregated stats bar
    WorkflowTable.tsx               — stateful table with inline editing lifecycle
    WorkflowRow.tsx                 — single row rendering (memo)
    procedure_form_modal/
      ProcedureFormModal.tsx        — unified create/edit modal (mode prop)
      useProcedureFormModal.ts      — form state, validation, auto-fill, gateway calls
    cell/                           — read-only and editing cell components
    editor/                         — inline field editors (autocomplete, amount, day)
    form/                           — inline entity creation forms (patient, fund)
    ui.styles.ts                    — shared TABLE_STYLES / COL_WIDTHS constants
  hooks/                            — useProcedureData, useProcedurePeriod, …
  model/                            — domain types, workflow state machine, mapper
  api/                              — gateway.ts (Tauri calls)
```
