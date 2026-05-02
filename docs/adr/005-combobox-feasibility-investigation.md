# ADR 005 — ComboboxField replacement feasibility investigation

**Date**: 2026-05-02
**Status**: Accepted — Option 1 (status quo + Tauri invoke seed helper)

---

## 1. Summary

`ComboboxField` wraps HeadlessUI v2's `Combobox` and is used in three places inside
`ProcedureFormModal`: patient selection in create mode (with inline patient creation),
patient selection in edit mode, and fund selection in create mode. All three are
single-select, synchronous (Zustand store), and use plain-string item rendering.
The testing problem documented in ADR 004 — HeadlessUI's `isTrusted` requirement plus
floating-ui portal clipping — is real and confirmed by code inspection. A custom
non-portaled replacement built on `react-aria` would solve the E2E gap, but it runs
directly into the modal's `overflow: hidden` constraint, adds a new dependency, and
does not allow removing HeadlessUI entirely (CreatePatientForm still uses HeadlessUI
Dialog). The existing RTL mock strategy in `ProcedureFormModal.test.tsx` already
covers the ComboboxField→form-state wiring. The main open question is whether
end-to-end coverage of the actual dropdown interaction is a product requirement.

---

## 2. Current usage inventory

### 2.1 Three call sites — all in `ProcedureFormModal.tsx`

**Usage A — create mode, patient field** (`ProcedureFormModal.tsx:215–227`)

| Prop          | Value                                                                                |
| ------------- | ------------------------------------------------------------------------------------ |
| `id`          | `"procedurePatient"`                                                                 |
| `items`       | `patientItems` — all patients from Zustand store, formatted via `formatPatientLabel` |
| `displayKey`  | `"label"` (string: `"NAME (SSN)"` or `"NAME"`)                                       |
| `idKey`       | `"id"`                                                                               |
| `value`       | `patientId` (string)                                                                 |
| `onChange`    | `handlePatientChange` (also auto-fills fund, type, date, amount)                     |
| `onCreateNew` | YES — opens `CreatePatientForm` nested modal                                         |
| `createLabel` | i18n key `"createPatient.submit"`                                                    |
| `error`       | `fieldErrors.patientId`                                                              |
| `searchKeys`  | none — defaults to `displayKey` only                                                 |

**Usage B — edit mode, patient field** (`ProcedureFormModal.tsx:229–239`)

Same as A except: no `onCreateNew`, no `createLabel`.

**Usage C — create mode, fund field** (`ProcedureFormModal.tsx:251–261`)

| Prop          | Value                                                         |
| ------------- | ------------------------------------------------------------- |
| `id`          | `"procedureFund"`                                             |
| `items`       | `sortedFunds` — funds from store, sorted by `fund_identifier` |
| `displayKey`  | `"fund_identifier"`                                           |
| `idKey`       | `"id"`                                                        |
| `searchKeys`  | `["fund_identifier", "name"]` (two-key fuzzy search)          |
| `value`       | `fundId`                                                      |
| `onChange`    | `setFundId`                                                   |
| `onCreateNew` | NO                                                            |
| `error`       | none                                                          |

### 2.2 Items list size and loading

- **Patients**: loaded upfront from SQLite into `useAppStore.patients` via `setPatients` /
  `addPatients`. The store holds the full list with no pagination. The ADR 004 context
  and task description indicate >1000 patients in production. The list is synchronous
  (already in memory when the modal opens).

  **Performance note**: `useFuzzySearch.ts:8–14` rebuilds the Fuse.js index inside
  `useMemo` on every change to `items`, `keys`, or `threshold`. With 1000+ patients,
  each store update triggers a full Fuse index rebuild. There is no virtualization:
  the dropdown renders a `slice(0, 6)` cap (`ComboboxField.tsx:114`), so per-render
  cost is bounded, but index reconstruction is O(N) on each patient list change. This
  is a latent performance issue independent of the portal question.

- **Funds**: store size is typically small (tens of items). No performance concern.

### 2.3 Feature flags across usages

| Feature                                                 | Usages A & B | Usage C |
| ------------------------------------------------------- | ------------ | ------- |
| Multi-select                                            | NO           | NO      |
| Async / server search                                   | NO           | NO      |
| Custom item rendering (icons, secondary text, grouping) | NO           | NO      |
| "Create new" inline                                     | YES (A only) | NO      |
| `searchKeys` override                                   | NO           | YES     |
| Error display                                           | YES          | NO      |

### 2.4 Tests that mock or skip ComboboxField

**RTL — `ProcedureFormModal.test.tsx:42–54`**: ComboboxField is replaced wholesale
with a native `<select>`. The mock renders the same `label`, `items`, `idKey`,
`displayKey`, `onChange`, and `error` props so the wiring tests pass. 7 test cases
cover: store population, disabled submit logic, full field submit, fund inclusion,
and error state. These tests would need no changes if ComboboxField is replaced by
any component with an identical prop surface.

**E2E — `e2e/helpers/seed.ts`**: No procedure seed helper exists. `seedBankAccount`,
`seedProcedureType`, and `seedPatient` are implemented but all three avoid ComboboxField
interaction. No E2E test currently creates or edits a procedure.

**Hook tests — `useProcedureFormModal.test.ts`**: Tests the hook in isolation via
`renderHook`. ComboboxField is never rendered; no impact from any replacement.

---

## 3. Requirements inventory

The following was checked in `docs/`, `src/`, and `README.md`.

| Requirement                             | Evidence                                                                                                                                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multi-select                            | Not found anywhere.                                                                                                                                                                          |
| Async / server-side search              | Not found. All data is in-memory Zustand store.                                                                                                                                              |
| Mobile-specific UX (full-screen picker) | Not found. App is desktop-only (Tauri).                                                                                                                                                      |
| IME / composition input (CJK)           | Not found. Patient names are French.                                                                                                                                                         |
| RTL layouts                             | Not found.                                                                                                                                                                                   |
| Grouped options                         | Not found.                                                                                                                                                                                   |
| Virtualization                          | Not implemented. Dropdown caps at 6 results (`ComboboxField.tsx:114`). Full list is in-memory; Fuse index is rebuilt on each list change. No virtualised list component referenced anywhere. |

---

## 4. Custom combobox assessment (react-aria + non-portaled + existing fuse.js)

### 4.1 What it would cover cleanly

- Usages A, B, C as described — all are single-select, synchronous, plain-string
  rendering.
- The existing `useComboboxField.ts` (30 lines) and `useFuzzySearch.ts` (25 lines)
  could be reused unchanged for query management and fuzzy filtering.
- The `onCreateNew` / `createLabel` pattern maps naturally to an extra list item at
  the bottom of the options list.
- Keyboard navigation (arrow keys, Enter, Escape) and ARIA roles (`role="combobox"`,
  `role="listbox"`, `aria-activedescendant`) are handled by react-aria hooks, avoiding
  hand-rolled accessibility code.

### 4.2 Critical constraint: `overflow: hidden` on modal panel

`ModalContainer.tsx:67` sets `overflow-hidden` on the dialog panel element:

```
className={`... rounded-[28px] shadow-elevation-4 ... overflow-hidden flex flex-col`}
```

`ProcedureFormModal.tsx:204` sets `overflow-y-auto` on the form body for scrolling.

An absolutely-positioned dropdown rendered **inside** either of these elements will be
clipped. This is the same physical constraint that floating-ui's portal solves by
escaping to `document.body`. A non-portaled approach requires one of:

(a) Remove `overflow-hidden` from the ModalContainer panel. Border-radius and
backdrop-blur do not depend on `overflow: hidden` (they are CSS properties on the
same element), but `overflow-hidden` is also what clips the content to the rounded
corners. In practice this means the scrollable form body's own `overflow-y-auto`
would need to be the only overflow constraint; the panel's visual corners would
still render correctly. **This change is likely safe but requires visual regression
testing.**

(b) Set `overflow: visible` only on the specific ancestor between the dropdown and the
modal's scroll container, and manage z-index carefully.

Neither option is a one-line change — both require verifying that the modal's visual
appearance is preserved across all five modes (create, edit, view, overpaid, refund).

### 4.3 Focus management interaction with ModalContainer

`ModalContainer.tsx:31–49` listens for `keydown Escape` to close the modal. A combobox
also closes its dropdown on Escape. If Escape is handled first by the combobox, it
must stop propagation to avoid also closing the modal. react-aria's `useComboBox` calls
`e.continuePropagation()` by default on unhandled keys — this interaction needs explicit
verification, but it is well-defined and solvable.

### 4.4 HeadlessUI cannot be removed

`CreatePatientForm.tsx:1` imports `{ Dialog }` from `@headlessui/react`. Replacing
ComboboxField does not remove this dependency. `@headlessui/react` stays regardless.

### 4.5 Size estimate

- **Files to add**: `src/ui/components/field/CustomComboboxField.tsx` (~100–140 lines),
  possibly a small `ComboboxListbox.tsx` sub-component (~40 lines) if the options list
  is extracted.
- **Files to modify**: `ComboboxField.tsx` (replace or redirect exports),
  `ModalContainer.tsx` (remove `overflow-hidden` from panel — ~1 line change),
  `ProcedureFormModal.test.tsx` (no change needed if prop surface is identical).
- **Dependencies to add**: `react-aria-components` (full package, tree-shakes to
  ~15–30 kB gzipped for combobox + listbox hooks). Alternatively individual
  `@react-aria/combobox`, `@react-aria/listbox`, and `@react-stately/combobox` packages
  (~12–18 kB gzipped combined). Currently zero react-aria code in the project.
- **Dependencies to remove**: None — `@headlessui/react` cannot be removed (see 4.4).

### 4.6 Risks

| Risk                                                      | Severity     | Notes                                                            |
| --------------------------------------------------------- | ------------ | ---------------------------------------------------------------- |
| `overflow: hidden` clipping of dropdown                   | High         | Must resolve before implementation — see 4.2                     |
| Accessibility regression vs. HeadlessUI's tested behavior | Medium       | react-aria is also well-tested; risk is in the integration layer |
| Focus escape from dropdown to modal-close on Escape       | Low          | Solvable with `e.stopPropagation()` in the combobox handler      |
| Fuse.js index rebuild cost with 1000+ patients            | Pre-existing | Not introduced by this change; present today                     |
| Visual regression from `overflow-hidden` removal          | Medium       | Requires manual check across all modal modes                     |

---

## 5. Alternatives comparison

### Option 1 — Status quo + Tauri invoke seed helper (accept manual test gap)

Keep HeadlessUI ComboboxField unchanged. Add a Tauri `invoke`-based
`seedProcedure(patientId, procedureTypeId, date)` helper to `e2e/helpers/seed.ts`
so tests that need a pre-existing procedure can create one without touching the UI.
This unlocks E2E coverage of payment, reconciliation, and overpayment flows that
currently cannot seed a procedure. It does **not** deliver automated coverage of the
ComboboxField dropdown interaction itself — that gap remains, covered only by manual
testing and the existing RTL mock. Cost: ~30 lines in `seed.ts`, no production code
changes, no new dependencies.

### Option 2 — Custom non-portaled combobox with react-aria

Replace `ComboboxField` with a custom component built on react-aria hooks and
absolutely-positioned (non-portaled) dropdown. Solves the E2E automation gap
completely: the dropdown is a regular DOM subtree, events are standard DOM events
(no `isTrusted` requirement), and `waitForDisplayed` works without viewport-portal
issues. Requires resolving the `overflow: hidden` modal constraint, adding
`react-aria-components` as a dependency, and preserving the `onCreateNew` prop.
Cannot remove HeadlessUI from the project (CreatePatientForm). Cost: ~2–3 days of
implementation + visual regression testing.

### Option 3 — Hidden test affordance (custom event or hidden native select)

This was rejected in ADR 004. The rejection holds:

- **Custom DOM event (`combobox:select`)**: embeds test machinery in production code.
  Still rejected.
- **Hidden native `<select>` alongside the combobox**: The RTL mock in
  `ProcedureFormModal.test.tsx` already implements this exact pattern, but at the
  test layer. Promoting it to production code adds DOM weight, requires `aria-hidden`
  - `tabIndex=-1` treatment, and in E2E would require `browser.execute` rather than
    a real user interaction. The same wiring coverage is achieved without production
    code risk by the existing mock. Still rejected.

---

## 6. Recommendation

**Recommended: Option 1 (status quo + Tauri invoke seed helper).**

The testing problem has two separable components:

1. **Wiring coverage** (does selecting a patient update the form state correctly?) —
   already solved by the RTL mock in `ProcedureFormModal.test.tsx`. Solid, deterministic,
   and maintained.

2. **E2E procedure seeding** (can downstream tests assume a procedure exists?) — blocked
   today. A Tauri invoke seed helper unblocks this immediately, with ~30 lines of code
   and zero production changes.

A custom react-aria combobox would add full end-to-end coverage of the dropdown
interaction itself (typing, seeing results, clicking), but this interaction is
HeadlessUI's own behavior — not application logic. The `overflow: hidden` constraint
is a real architectural obstacle that would require a production change to ModalContainer
with visual regression risk. The fact that HeadlessUI stays as a dependency (due to
CreatePatientForm) means the bundle saving does not materialise.

**If the decision criteria shifts** — specifically, if the team decides that E2E coverage
of the actual patient selection interaction is a product requirement (not just a nice
to have) — then Option 2 becomes the right choice. In that case, the `overflow: hidden`
constraint should be resolved first as a standalone ModalContainer refactor, before the
combobox work begins.

---

## 7. Open questions for the human

1. **Is E2E coverage of the dropdown interaction itself required?** The RTL mock covers
   wiring. Manual testing covers the UX. Is that sufficient, or is there a specific
   scenario (regression risk, CI gate) that requires automated dropdown interaction?

2. **Can `overflow: hidden` be removed from ModalContainer's panel?** A quick visual
   check (all five procedure modal modes + CreatePatientForm backdrop) would confirm
   whether the border-radius/backdrop-blur appearance is preserved without it.

3. **Is `CreatePatientForm.tsx`'s HeadlessUI `Dialog` also a testing concern?** If it
   is, a migration away from HeadlessUI would have a wider scope (and then Option 2
   becomes more attractive by finally removing the dependency).

4. **What is the acceptable bundle size for a new dependency?** react-aria adds ~15–30 kB
   gzipped; if that budget does not exist, Option 1 is the only viable path.

5. **Should the Fuse.js index rebuild cost with 1000+ patients be addressed independently
   of this decision?** The current `useMemo` in `useFuzzySearch.ts:8` rebuilds the index
   on every `list` change. Memoising the index with a stable reference to the patient
   list, or debouncing the query, would be a standalone optimisation unrelated to the
   portal question.

---

## References

- `src/ui/components/field/ComboboxField.tsx` — current implementation (144 lines)
- `src/ui/components/field/useComboboxField.ts` — query/filter logic (29 lines)
- `src/lib/useFuzzySearch.ts` — Fuse.js wrapper (25 lines)
- `src/features/procedure/ui/procedure_form_modal/ProcedureFormModal.tsx:215–261` — three call sites
- `src/features/procedure/ui/procedure_form_modal/ProcedureFormModal.test.tsx:42–54` — ComboboxField mock
- `src/ui/components/modal/ModalContainer.tsx:67` — `overflow-hidden` constraint
- `src/features/procedure/ui/form/CreatePatientForm.tsx:1` — remaining HeadlessUI Dialog usage
- `e2e/helpers/seed.ts` — no procedure seed helper exists
- `docs/adr/004-e2e-rtl-test-boundary-combobox.md` — prior decision

### ADR 004 discrepancy

ADR 004, "Alternatives Considered" section, states: "ModalContainer: HeadlessUI Dialog
focus-trap interferes with userEvent." The current `ModalContainer.tsx` does **not**
use HeadlessUI Dialog — it is a custom React component with a manual Escape handler
and no focus trap. The mock in `ProcedureFormModal.test.tsx` retains ModalContainer
as a test double (reasonable for simplifying the fixed-overlay rendering in jsdom),
but the stated reason in ADR 004 is factually incorrect about the current implementation.
This does not change any conclusion in ADR 004 or this document.
