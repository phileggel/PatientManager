# Business Rules — Procedure Page

## Context

The procedure page is the main data-entry screen. It lets practitioners record care acts
(procedures) month by month, using a read-only list. Procedures are created via a modal form
and edited in place via that same modal. Inline editing has been removed in favour of the modal
workflow.

---

## Frontend Rules

**R1 — Period selection** : Procedures are filtered by month and year. The selected month/year
persists across page navigation via `sessionStorage` (`procedureSelectedMonth`,
`procedureSelectedYear`).

**R4 — Auto-fill on patient selection** : In create mode, when a patient is selected in the
modal, fund, procedure type, and amount are pre-filled from the patient's latest recorded
procedure (`latest_fund`, `latest_procedure_type`, `latest_procedure_amount`). Today's date is
also pre-filled if no date has been entered yet.

**R5 — Delete confirmation** : Deleting a procedure always requires a `ConfirmationDialog`.
No row may be deleted without explicit user confirmation.

**R6 — Edit via modal** : Saved procedures can be edited in `ProcedureFormModal` (mode="edit").
The modal pre-fills all editable fields from the existing procedure. Payment status and actual
paid amount are shown read-only.

**R7 — Summary stats** : The header bar shows aggregated stats for the currently filtered rows
(period + search): unique patient count, procedure count, total billed (`procedureAmount`),
total received (`actualPaymentAmount`), and total awaited
(`max(0, procedureAmount − actualPaymentAmount)` per row). Draft rows are excluded from all
stats.

**R8 — Procedure update events** : When the backend emits a `procedure_updated` window event
(relayed by `useAppInit`), the procedure list is refreshed automatically. Reload failures
must be logged and shown to the user via a toast.

**R9 — Inline entity creation** : From the patient or fund combobox in create mode, a
practitioner can create a new patient or fund without closing the modal. The creation form
appears in a nested modal; on success, the new entity is automatically selected.

**R10 — Status badge** : The payment status of each procedure is displayed as a colour-coded
badge. Statuses and their M3 token mapping:
- `NONE` → `bg-m3-surface-container-high` / `text-m3-on-surface-variant`
- `CREATED` → `bg-m3-secondary-container` / `text-m3-on-secondary-container`
- `RECONCILIATED`, `PARTIALLY_RECONCILED` → `bg-m3-tertiary-container` / `text-m3-on-tertiary-container`
- `DIRECTLY_PAYED`, `FUND_PAYED`, `PARTIALLY_FUND_PAYED`, `IMPORT_DIRECTLY_PAYED`, `IMPORT_FUND_PAYED` →
  `bg-m3-primary-container` / `text-m3-on-primary-container`

**R11 — Search filter** : A free-text search filters the period rows by patient name or status.

**R12 — FAB to create** : A Floating Action Button (FAB, bottom-right, 56×56 px, `rounded-full`)
opens `ProcedureFormModal` in create mode. The table takes the full content width.

---

## Component Structure

```
procedure/
  api/
    gateway.ts                        — all Tauri calls for this feature
    procedureService.ts               — higher-level service (multi-step operations)
  hooks/
    useProcedureData.ts               — loads patients/funds/procedureTypes; exposes deleteRow
    useProcedurePeriod.ts             — filters rows by selected month/year; derives yearRange
    useCreateEntityForm.ts            — generic hook for create-patient / create-fund forms
  model/
    procedure-row.types.ts            — ProcedureRow interface (UI representation)
    procedure-row.mapper.ts           — Procedure → ProcedureRow (amounts: milliemes → euros)
    date.logic.ts                     — getMonthName, formatDateDisplay, period helpers
    index.ts                          — re-exports
  ui/
    ProcedurePage.tsx                 — main page (period selector, search, stats, list, FAB, modal)
    PeriodSelector.tsx                — month/year CompactSelectField dropdowns + nav arrows
    SummaryStats.tsx                  — aggregated stats bar (patients, procedures, billed, received, awaited)
    ui.styles.ts                      — shared TABLE_STYLES / COL_WIDTHS constants
    procedure_list/
      ProcedureList.tsx               — read-only table (all rows for the filtered period)
      StatusBadge.tsx                 — colour-coded payment status chip
    procedure_form_modal/
      ProcedureFormModal.tsx          — unified create/edit modal (mode prop)
      useProcedureFormModal.ts        — form state, validation, auto-fill (R4), gateway calls
    form/
      CreatePatientForm.tsx           — nested modal for inline patient creation (R9)
      CreateFundForm.tsx              — nested modal for inline fund creation (R9)
```
