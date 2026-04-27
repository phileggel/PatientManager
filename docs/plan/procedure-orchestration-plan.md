# Procedure Orchestration — Amendment Plan [DONE]

> Spec: `docs/spec/procedure-orchestration.md`
> Scope: Amendments only — rules R6, R9, R18, R26, R28, R29, R30, R31, R32.
> Existing feature: `src/features/procedure/` (layer-first layout: `api/`, `hooks/`, `model/`, `ui/`)
> Backend: `src-tauri/src/use_cases/procedure_orchestration/`

---

## Workflow Checklist

- [x] Review Architecture & Rules (`ARCHITECTURE.md`, `backend-rules.md`, `frontend-rules.md`)
- [x] Backend Implementation — add `tracing::warn!` in `update_procedure` handler (R18)
- [x] Type Synchronization (`just generate-types`) — no new types, but run anyway to confirm no drift
- [x] Frontend Implementation — INS formatter (R28/R31), ComboboxField in edit mode (R29/R32), view-mode refactor (R26/R30), R9 cleanup
- [x] Formatting & Linting (`just format` + `python3 scripts/check.py`)
- [x] Code Review (`reviewer`)
- [x] UX Review (`ux-reviewer` — .tsx files modified)
- [x] i18n Review (`i18n-checker` — translation keys added/removed)
- [x] Unit & Integration Tests
- [x] Documentation Update (`ARCHITECTURE.md` if structural changes) — no structural change: `patient.presenter.ts` follows existing model/presenter pattern already documented
- [x] Final Validation (`spec-checker` + `workflow-validator`)

---

## Reviewer Waivers

| Finding                           | File                                     | Reviewer verdict | Decision   | Evidence                                                                                                                                                                               |
| --------------------------------- | ---------------------------------------- | ---------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status.payed` is a dead i18n key | `en/procedure.json`, `fr/procedure.json` | Warning — remove | **Waived** | Key IS consumed: `StatusBadge.tsx:32` uses `isAnyPayed ? "payed"` as a dynamic key under the `status.*` namespace. Grep confirms one consumer. Reviewer missed the dynamic key lookup. |

---

## Rules Coverage Table

| Rule          | Scope    | Status                                                                                                                                                       | Tasks                    |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| R6 (amended)  | Frontend | Routing already implemented in `ProcedurePage.tsx` (`handleEdit` uses `isBlockingStatus`) — no change needed                                                 | —                        |
| R9 (amended)  | Frontend | Remove `CreateFundForm` from modal and all related state                                                                                                     | Tasks F-1, F-2, F-3      |
| R18 (amended) | Backend  | Add `tracing::warn!` in `update_procedure` handler when blocking-status acte is updated with fields other than `procedure_type_id`                           | Task B-1                 |
| R26 (amended) | Frontend | Refactor view mode: read-only patient display uses INS format, hide system info block and payment info, enable save button with loading/success/error states | Tasks F-4, F-5           |
| R28 (new)     | Frontend | Create `formatPatientLabel(patient)` helper function returning `"LASTNAME Firstname (SSN)"` when SSN present, `"LASTNAME Firstname"` otherwise               | Task F-6                 |
| R29 (new)     | Frontend | ComboboxField patient in edit mode: items use R28 format, `displayKey` renders via formatter                                                                 | Tasks F-7, F-8           |
| R30 (new)     | Frontend | Edit mode: remove system info block (ID), remove payment info section, keep patient/fund/type/date/amount editable with loading/success/error                | Task F-9                 |
| R31 (new)     | Frontend | Apply `formatPatientLabel` in ComboboxField items (create + edit), selected value display, and read-only patient in view mode                                | Tasks F-6, F-7, F-8, F-4 |
| R32 (new)     | Frontend | Create mode: `onCreateNew` prop present on patient ComboboxField. Edit mode: `onCreateNew` prop absent, no create button                                     | Tasks F-7, F-8           |

---

## Detailed Implementation Plan

### Backend — Task B-1: Add `tracing::warn!` in `update_procedure` handler (R18)

**File**: `src-tauri/src/use_cases/procedure_orchestration/api.rs`

**What**: In the `update_procedure` Tauri command, after `raw.into_procedure()` succeeds, inspect the raw data to detect when a blocking-status procedure is being updated with fields other than `procedure_type_id`. If detected, emit a `tracing::warn!` with structured fields: `procedure_id`, `payment_status`, and the list of modified field names.

**Blocking statuses to check**: `RECONCILIATED`, `PARTIALLY_RECONCILED`, `FUND_PAYED`, `PARTIALLY_FUND_PAYED`, `DIRECTLY_PAYED` (matches `isBlockingStatus` on the frontend).

**Implementation detail**: Define a private helper or inline check within the handler. The check compares fields present in `RawProcedure` other than `procedure_type_id` against a known-blocking status. Use `BACKEND` constant from `crate::core::logger` per rule B16.

**No behavioral change**: The update proceeds regardless. The warn is purely observability.

---

### Frontend — Task F-1: Remove `fundModal` state and `handleFundCreated` from `useProcedureFormModal`

**File**: `src/features/procedure/ui/procedure_form_modal/useProcedureFormModal.ts`

**What**:

- Remove `fundModal` state (`useState`).
- Remove `setFundModal` setter.
- Remove `handleFundCreated` callback.
- Remove the `gateway.createNewFund` call within that callback.
- Remove `AffiliatedFund` import if no longer needed.
- Do NOT remove `fundId` / `setFundId` — fund selection via `SelectField` in edit/view mode stays.
- Return value: stop returning `fundModal`, `setFundModal`, `handleFundCreated`.

**Note**: `createNewFund` in `gateway.ts` stays — it may be used elsewhere (or can stay unused; do not delete gateway methods).

---

### Frontend — Task F-2: Remove `CreateFundForm` from `ProcedureFormModal.tsx`

**File**: `src/features/procedure/ui/procedure_form_modal/ProcedureFormModal.tsx`

**What**:

- Remove `import { CreateFundForm } from "../form/CreateFundForm"`.
- Remove the destructured props from `useProcedureFormModal`: `fundModal`, `setFundModal`, `handleFundCreated`.
- In the JSX, remove the `<CreateFundForm ... />` block entirely from the entity creation modals section at the bottom.
- The `ComboboxField` for fund in create mode currently passes `onCreateNew={(q) => setFundModal({ open: true, query: q })}` — remove this prop and the `createLabel` for fund. The fund ComboboxField in create mode becomes a pure search combobox without inline creation (R9: only patient inline creation is kept).

---

### Frontend — Task F-3: Delete `CreateFundForm.tsx` and clean up `form/index.ts`

**Files**:

- `src/features/procedure/ui/form/CreateFundForm.tsx` — delete entirely.
- `src/features/procedure/ui/form/index.ts` — remove the `CreateFundForm` export line.

**Note**: `CreatePatientForm.tsx` and its export remain untouched. Verify `useCreateEntityForm.ts` is not exclusively used by `CreateFundForm` before considering removal — it is also used by `CreatePatientForm`, so it stays.

**i18n cleanup**: The `createFund.*` keys in `en/procedure.json` and `fr/procedure.json` must be removed since the component is deleted (R9 — fund inline creation is removed from this feature).

---

### Frontend — Task F-6: Create `formatPatientLabel` presenter function (R28, R31)

**File**: `src/features/procedure/model/procedure-row.mapper.ts` OR new file `src/features/procedure/model/patient.presenter.ts`

**Recommendation**: Add as a named export in `src/features/procedure/model/index.ts` alongside existing model exports. Place the implementation in `procedure-row.mapper.ts` if the mapper already imports `Patient`, or create a dedicated `patient.presenter.ts` file — whichever keeps the mapper focused.

**Signature**:

```ts
export function formatPatientLabel(patient: {
  name: string | null;
  ssn: string | null;
}): string;
```

**Behavior**:

- If `ssn` is non-null and non-empty: return `"${patient.name ?? '—'} (${patient.ssn})"`.
- Otherwise: return `patient.name ?? "—"`.

**Re-export from** `src/features/procedure/model/index.ts`.

**Test**: Add unit tests in a colocated `.test.ts` file (or within an existing test file if appropriate). Test cases: with SSN, without SSN, null name with SSN, null name without SSN.

---

### Frontend — Task F-7: Add patient `ComboboxField` in edit mode (R29, R32)

**File**: `src/features/procedure/ui/procedure_form_modal/ProcedureFormModal.tsx`

**Current state**: Edit mode uses a `SelectField` for the patient. This must be replaced with a `ComboboxField`.

**What**:

- In the `mode !== "create"` branch of the patient field, replace `<SelectField>` with `<ComboboxField>`.
- Use `formatPatientLabel` to build a display-ready list. Since `ComboboxField` uses `displayKey` to render items, one approach is to transform the `patients` array into `{ id, label }` objects before passing them in, where `label = formatPatientLabel(patient)`. Alternatively, since `ComboboxField` is generic, pass a `searchKeys` array covering both `name` and a pre-formatted label field.
- The simplest conforming approach: derive a `patientItems` list in the hook as `patients.map(p => ({ id: p.id, label: formatPatientLabel(p) }))` and pass `displayKey="label"` and `idKey="id"` and `searchKeys={["label"]}`.
- Do NOT pass `onCreateNew` in edit mode (R32 — no create button in edit mode).
- Pass `error={fieldErrors.patientId}`.
- The combobox must be pre-positioned on the current patient: `value={patientId}` matches against `idKey="id"` — this works with the existing `ComboboxField` logic (it finds `items.find(item => String(item.id) === value)`).

**Hook changes** (`useProcedureFormModal.ts`): Add `patientItems` derived value for the formatted patient list.

---

### Frontend — Task F-8: Apply `formatPatientLabel` in create mode ComboboxField (R31)

**File**: `src/features/procedure/ui/procedure_form_modal/ProcedureFormModal.tsx`

**Current state**: Create mode `ComboboxField` uses `displayKey="name"` directly on the `Patient` object, showing only the name. The INS is not shown.

**What**:

- In the create mode ComboboxField for patient, also use the pre-formatted `patientItems` list (same as task F-7) instead of raw `patients`.
- `onCreateNew` remains present in create mode (R32).
- This ensures R31 is satisfied in create mode ComboboxField items and selected value.

---

### Frontend — Task F-4: Refactor view mode in `ProcedureFormModal.tsx` (R26)

**File**: `src/features/procedure/ui/procedure_form_modal/ProcedureFormModal.tsx`

**Current state**: In view mode, the modal shows:

- Patient field: `SelectField` (disabled).
- Fund field: `SelectField` (disabled).
- Procedure type: `SelectField` (disabled because `isViewMode` makes all fields disabled).
- Date, amount: disabled fields.
- System info block: shows procedure ID.
- Patient info block: shows SSN and fund name.
- Payment info block: shows payment method, payment date, status, paid amount.

**Target state** per R26:

- Patient: read-only display of patient name with INS format (`formatPatientLabel`). Not a form field — a `TextField` with `readOnly` or a plain div.
- Date: read-only `TextField`.
- Amount: read-only `TextField` (formatted).
- Fund: read-only `TextField` showing fund identifier (or "—").
- Procedure type: editable `SelectField` (the only editable field in view mode).
- System info block: **remove** (no ID displayed).
- Patient info block: **remove** (SSN/fund shown inline in read-only patient row instead).
- Payment info block: **remove** (not displayed in view mode).
- Footer: save button present and functional; loading/success/error states apply (already implemented — `handleSubmit` with `mode === "view"` currently returns early, this must be changed to actually call `updateProcedure` with only `procedure_type_id` modified).

**Hook change** (`useProcedureFormModal.ts`): In `handleSubmit`, when `mode === "view"`, do NOT return early. Instead, call `gateway.updateProcedure` with the original procedure data but `procedure_type_id` replaced by the current form value. All other fields pass through from the original `procedure` prop unchanged.

**i18n**: Remove translation keys for `modal.systemInfo`, `modal.procedureId`, `modal.patientInfo`, `modal.ssn`, `modal.fundName`, `modal.paymentInfo`, `modal.status`, `modal.paidAmount` only if they are not used elsewhere. Add new key `modal.patientLabel` for the read-only patient label if needed.

---

### Frontend — Task F-5: Add i18n key for ComboboxField no-results message (R29)

**Files**: `src/i18n/locales/en/procedure.json`, `src/i18n/locales/fr/procedure.json`

**What**: The ComboboxField currently shows `filter.emptySearch` when no results match. Verify that this key is already used by the ComboboxField in the modal context (the `ComboboxField` component does not render a no-results message internally — it simply shows no options). If a no-results message needs to be added to the ComboboxField, it requires a prop (e.g. `noResultsLabel`) — check the component's API first.

**Resolution**: Looking at `ComboboxField.tsx`, there is no built-in no-results message. The dropdown only shows when `query.length >= 2 && (hasResults || !!onCreateNew)`. In edit mode (no `onCreateNew`), the dropdown is hidden when there are no results — this is the "neutral" behavior (empty, no message). This satisfies R29's requirement for a "neutral message" implicitly (no dropdown appears). No component change is required. No new i18n key needed for this task.

**If a visible message IS required**: Add `noResultsLabel` prop to `ComboboxField` (must NOT modify the generic component for feature-specific text per F12 — acceptable here since it is a generic message). Add i18n keys `filter.noPatientResults` (en: "No patients found", fr: "Aucun patient trouvé") and render a non-selectable option in `ComboboxField`. Defer this to the ux-reviewer decision.

---

### Frontend — Task F-9: Verify edit mode removes system info and payment sections (R30)

This task is largely covered by Task F-4. Ensure the same cleanup (`modal.systemInfo`, `modal.procedureId`, patient info block, payment info block) applies to edit mode (`mode === "edit"`) as well.

**Current state**: In edit mode, the modal shows:

- System info block with procedure ID.
- Patient info block with SSN and fund name.
- Payment info block with method, date, status, paid amount.

**Target state** per R30: None of these blocks are displayed in edit mode. Only the five editable fields are shown: patient (ComboboxField), fund (SelectField), procedure type (SelectField), date (DateField), amount (AmountField).

**What**: The `{mode !== "create" && ...}` guards around these blocks must become `false` for both edit and view. Remove or restructure those conditional blocks so they never render in any mode.

---

### i18n Cleanup Summary

**Keys to REMOVE** from both `en/procedure.json` and `fr/procedure.json`:

- `createFund.*` (entire sub-object) — component deleted (Task F-3).
- `modal.systemInfo`, `modal.procedureId` — system info block removed (Tasks F-4, F-9).
- `modal.patientInfo`, `modal.ssn`, `modal.fundName` — patient info block removed (Tasks F-4, F-9).
- `modal.paymentInfo`, `modal.status`, `modal.paidAmount` — payment info block removed (Tasks F-4, F-9).

**Keys to ADD**:

- `modal.patient` (or reuse `form.patient`) — label for the read-only patient in view mode if a dedicated label is needed.
- Verify `filter.emptySearch` is still used after changes (it may remain used in `ProcedureList`).

---

### Test Updates

**`useProcedureFormModal.test.ts`**:

- Remove test cases that reference `fundModal`, `setFundModal`, `handleFundCreated`, `createNewFund` mock calls.
- Add test: in `mode="view"`, `handleSubmit` calls `gateway.updateProcedure` with only `procedure_type_id` changed.
- Add test: in `mode="edit"`, patient ComboboxField items use `formatPatientLabel` format (test via hook's `patientItems` return value).

**`patient.presenter.test.ts`** (or in mapper test file):

- Test `formatPatientLabel` with SSN, without SSN, null name.

**`useProcedureFormModal.test.ts`** — update existing mock:

- Remove `createNewFund` from gateway mock (it is no longer called from this hook).

---

## File Change Summary

| File                                                                             | Action                                                                                                       | Tasks                   |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------- |
| `src-tauri/src/use_cases/procedure_orchestration/api.rs`                         | Modify — add `tracing::warn!` in `update_procedure`                                                          | B-1                     |
| `src/features/procedure/ui/procedure_form_modal/useProcedureFormModal.ts`        | Modify — remove fund modal state/handler, add `patientItems`, fix view-mode submit                           | F-1, F-4, F-7           |
| `src/features/procedure/ui/procedure_form_modal/ProcedureFormModal.tsx`          | Modify — remove fund ComboboxField create, use ComboboxField for patient in edit, refactor view/edit content | F-2, F-4, F-7, F-8, F-9 |
| `src/features/procedure/ui/procedure_form_modal/useProcedureFormModal.test.ts`   | Modify — remove fund mock calls, add view-mode submit test, update patientItems tests                        | Tests                   |
| `src/features/procedure/ui/form/CreateFundForm.tsx`                              | Delete                                                                                                       | F-3                     |
| `src/features/procedure/ui/form/index.ts`                                        | Modify — remove CreateFundForm export                                                                        | F-3                     |
| `src/features/procedure/model/procedure-row.mapper.ts` or `patient.presenter.ts` | Modify/Create — add `formatPatientLabel`                                                                     | F-6                     |
| `src/features/procedure/model/index.ts`                                          | Modify — re-export `formatPatientLabel`                                                                      | F-6                     |
| `src/i18n/locales/en/procedure.json`                                             | Modify — remove `createFund.*`, remove system/patient/payment modal blocks                                   | F-3, F-4, F-9           |
| `src/i18n/locales/fr/procedure.json`                                             | Modify — same as en                                                                                          | F-3, F-4, F-9           |

---

## Dependency Order

1. **B-1** — Backend warn (independent, no type changes).
2. `just generate-types` — run once to confirm no type drift before frontend work.
3. **F-6** — `formatPatientLabel` (no dependencies on other tasks).
4. **F-1** — Remove fund modal state from hook.
5. **F-3** — Delete `CreateFundForm.tsx`, update `index.ts`.
6. **F-2** — Remove `CreateFundForm` usage from modal component.
7. **F-7** + **F-8** — Patient ComboboxField in edit and create modes (depends on F-6).
8. **F-4** + **F-9** — View/edit mode refactor (depends on F-7, F-8, F-1).
9. **i18n cleanup** — `en/procedure.json` and `fr/procedure.json`.
10. **Tests** — update and add.
