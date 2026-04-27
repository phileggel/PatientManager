# Business Rules — Procedure Type Management

## Context

A `ProcedureType` represents a reusable medical-procedure template (e.g. "Consultation", "Blood test", "X-ray"). It is the reference used when creating procedures (`Procedure`): the type provides a name and a default amount, which the user can then adjust on each individual procedure.

The procedure-type management page is a self-contained CRUD view reachable from the main navigation. An alternative entry point for creation exists via the Excel import (`docs/excel-import-rules.md`) — backend validation rules R1 through R3 apply in both cases.

---

## Entity definitions

### ProcedureType

A user-configurable medical-procedure template.

| Field            | Business meaning                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `name`           | User-defined readable name of the procedure type (e.g. "Consultation"). Required. Unique among active types.              |
| `default_amount` | Default amount of the procedure, expressed in thousandths of a euro (`i64`). Must be ≥ 0. Displayed in euros in the UI.   |
| `category`       | Free-form, optional grouping defined by the user (e.g. "Biology", "Imaging"). May be absent.                              |

All fields (`name`, `default_amount`, `category`) are editable after creation for user types. The `id` field is immutable once generated. The reserved `import-pdf` type is the exception: none of its fields can be edited (see R22).

---

## Business Rules

### Backend

**R1 — Name validation (backend)**: The `name` is validated after trimming leading and trailing whitespace. An empty name, or one containing only whitespace, is rejected with an explicit error.

**R2 — Amount validation (backend)**: The `default_amount` must be ≥ 0. A negative amount is rejected with an explicit error. There is no upper bound.

**R3 — Optional category (backend)**: The `category` is optional. An empty string sent by the frontend is normalized to `null` before storage.

**R4 — Name uniqueness (frontend + backend)**: Two active procedure types cannot share the same name. Comparison is performed on the name normalized per R1, case-insensitively. Any creation or edit attempt that would produce a duplicate is rejected by the backend with an explicit error. The frontend displays this error inline in the relevant modal. This rule applies to both creation and editing.

**R5 — Event after mutation (backend)**: Any mutation of a `ProcedureType` (create, edit, or delete) publishes the `ProcedureTypeUpdated` event on the event bus. This event is a systematic side effect that triggers a frontend store refresh without manual reloading.

**R6 — Soft delete (backend)**: Deleting a `ProcedureType` is logical (soft-delete): the type is marked as deleted and no longer appears in the list, but existing `Procedure` records that reference it keep their reference intact. No usage check is performed before deletion. Deletion is irreversible from the user interface. The reserved `import-pdf` type is protected against deletion (see R22).

**R21 — Reserved-type seed (backend)**: A `ProcedureType` with the fixed identifier `import-pdf` is created automatically by the initial database migration (historical name `"Import PDF"`). A subsequent migration renames this type to `"Import"` as part of this feature. The identifier `import-pdf` is preserved as-is so existing data (procedures and mappings) remain valid. The name `"Import"` participates in the uniqueness check (R4): any attempt to create a type with this name (regardless of case) is rejected as a duplicate.

**R22 — Reserved-type protection (backend)**: The backend includes `import-pdf` in the results of `read_all_procedure_types` (filtering is delegated to the frontend, R23). It rejects any attempt to edit or delete this type with an explicit error.

**R23 — Exclusion from the table (frontend)**: The reserved `import-pdf` type is filtered out of the store before display. It never appears in the procedure-types table.

### Frontend

**R7 — Amount conversion (frontend + backend)**: The `default_amount` is stored in thousandths of a euro (`i64`). User input (in euros, decimal format) is multiplied by 1,000 before being sent to the backend. Display follows the format `€{(default_amount / 1000).toFixed(2)}`. This contract is shared between the frontend and the backend.

**R8 — Form validation (frontend)**: Submission is blocked if the name is empty or contains only whitespace, or if the amount is missing or non-numeric. Errors are displayed inline below each affected field and cleared as the user corrects their input.

**R9 — Procedure-types table (frontend)**: The table displays the following columns, with no default sort:

| Column   | Content                                 | Sortable |
| -------- | --------------------------------------- | -------- |
| Name     | `name`                                  | Yes      |
| Amount   | `€{(default_amount / 1000).toFixed(2)}` | Yes      |
| Category | `category` (or `–` if absent)           | No       |
| Actions  | Edit button + Delete button             | No       |

**R10 — Sorting behavior (frontend)**: Clicking the header of a sortable column cycles through sort states: ascending → descending → no sort. A visual indicator on the header reflects the active sort and its direction. Sort state is not persisted across navigations: the page always opens with no active sort.

**R11 — Search and filtering (frontend)**: A search field filters rows in real time on name and category simultaneously (partial match, case-insensitive). The header shows the number of procedure types matching the active search (excluding the reserved type); with no active search, it shows the total.

**R12 — Empty state (frontend)**: If no `ProcedureType` exists, the table displays a message inviting the user to create their first procedure type via the FAB.

**R13 — No search results (frontend)**: If the search matches no procedure type, the table displays a neutral message distinct from the empty state (R12). This message does not invite the user to create a procedure type.

**R14 — Loading state (frontend)**: The table displays an animated loading state while initial data is being fetched from the store.

**R15 — Initial load error (frontend)**: If the initial procedure-types load fails (network or backend error), the table displays an error message with a "Retry" button to re-issue the request.

**R16 — Add via creation modal (frontend)**: A floating FAB at the bottom-right opens a creation modal with Name (required), Amount (required), and Category (optional) fields. After successful creation, the modal closes and the form is reset (cleared) for possible further entry. On backend error (duplicate R4, invalid amount R2, or network error), the modal stays open and an error snackbar is shown.

**R17 — Edit (frontend)**: The Edit button (pencil icon) on a row opens an edit modal pre-filled with the current values. A double-click on a row produces the same effect; the maximum delay between the two clicks defining a double-click is 300 ms. After successful save, the modal closes and a success snackbar is shown. On backend error (duplicate R4 or network error), the modal stays open and an error snackbar is shown.

**R18 — Reset of the edit form (frontend)**: When the edit modal opens on a procedure type different from the previous one, the form is reset with the new procedure type's values. Any validation errors shown during the previous opening are cleared.

**R19 — Delete (frontend)**: The Delete button (trash icon) opens a confirmation dialog with `variant="danger"`. Confirmation triggers the deletion (R6). Success is acknowledged with a snackbar. On error, an error snackbar is shown.

**R20 — Success feedback (frontend)**: Any successful create (R16), edit (R17), or delete (R19) operation displays a success snackbar.

---

## Workflow

```
[User opens "Procedure types"]
  → Table (no default sort) + FAB
          │
          ├─ [Loading] → Animated loading state (R14)
          │           → Error → message + Retry button (R15)
          │
          ├─ [Search] → Real-time filter on name + category (R11)
          │          → No results → neutral message (R13)
          │
          ├─ [Header click] → Cyclic sort asc/desc/none + indicator (R10)
          │
          ├─ [FAB] → Creation modal (Name + Amount + optional Category)
          │   → Inline validation if a field is invalid (R8)
          │   → Create → modal closed + form reset → success snackbar (R16, R20)
          │   → Backend error (duplicate, network) → modal stays open → error snackbar (R16)
          │
          ├─ [Row double-click / Edit button] → Pre-filled edit modal (R17, R18)
          │   → Inline validation if a field is invalid (R8)
          │   → Edit → modal closed → success snackbar (R17, R20)
          │   → Backend error (duplicate, network) → modal stays open → error snackbar (R17)
          │
          └─ [Delete button] → Confirmation dialog (R19) → Confirm → Delete → success snackbar (R20)
                                                                          → Backend error → error snackbar (R19)
```

---

## UX mockup

### Entry point

**Procedure types** — item in the main navigation (side rail).

### Main component

Full-width page with a table, a header (title, total counter, search field), and a floating FAB at the bottom-right.

### States

- **Loading**: animated loading row in the table (R14)
- **Load error**: error message + Retry button (R15)
- **Empty**: message inviting the user to create the first type via the FAB (R12)
- **No results**: neutral message with no invitation to create (R13)
- **Creation modal**: Name + Amount + Category, inline validation, FAB as trigger (R16)
- **Edit modal**: pre-filled fields, double-click or Edit button as trigger (R17)
- **Delete dialog**: `variant="danger"` confirmation (R19)
- **Success / error snackbar**: after any mutation (R20)

### User flow

1. The user opens the Procedure Types page.
2. They click the FAB → creation modal → enter Name + Amount (+ optional Category) → submit → type created → modal closed, form reset.
3. They double-click a row (or click Edit) → pre-filled edit modal → edit → save → modal closed.
4. They click Delete → confirmation dialog → confirm → type deleted.

---

## Open questions

None — all questions have been resolved.
