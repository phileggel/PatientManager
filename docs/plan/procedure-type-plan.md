# Implementation Plan — Procedure Type Management

> Spec: `docs/spec/procedure-type.md`
> Rules covered: R1 → R23

---

## TODO — Execution order

- [x] **1. SQL migration** — rename `"Import PDF"` → `"Import"`
- [x] **2. Backend repository** — `find_by_name` case-insensitive (R4)
- [x] **3. Backend service** — `import-pdf` guard + duplicate check + category normalization (R3, R4, R22)
- [x] **4. Backend tests** — service.rs (R3, R4, R22)
- [x] **5. generate-types** — `just generate-types`
- [x] **6. Frontend shared** — `RESERVED_PROCEDURE_TYPE_ID` constant
- [x] **7. Frontend useProcedureTypeList** — filter `import-pdf` + error + retry (R23, R15)
- [x] **8. Frontend useProcedureTypeManager** — filtered counter (R11, R23)
- [x] **9. Frontend ProcedureTypeList** — empty / no-result / error states (R12, R13, R15)
- [x] **10. Frontend create_procedure_type_modal** — hook + FAB component + modal (R16)
- [x] **11. Frontend ProcedureTypeManager** — full-width layout + FAB + new modal (R16)
- [x] **12. Remove add_procedure_type_panel/**
- [x] **13. i18n** — fr + en (R12, R13, R15, R16)
- [x] **14. Frontend tests** — useCreateProcedureTypeModal + ProcedureTypeManager + ProcedureTypeList
- [x] **15. Quality checks** — `python3 scripts/check.py`
- [x] **16. reviewer** — 0 finding before continuing
- [x] **17. ux-reviewer** — 0 finding before continuing (.tsx files modified)
- [x] **18. i18n-checker** — missing or hardcoded keys
- [x] **19. Docs** — ARCHITECTURE.md + docs/todo.md
- [x] **20. spec-checker** — R1→R23 all covered

---

## Detailed plan

### Step 1 — Database migration (R21)

Create `src-tauri/migrations/20260406_rename_import_pdf.sql`:

```sql
UPDATE procedure_type SET name = 'Import' WHERE id = 'import-pdf';
```

Then:

```bash
just clean-db
just prepare-sqlx
```

---

### Step 2 — Backend: repository (R4)

**`src-tauri/src/context/procedure/repository/procedure_type.rs`**

- `find_by_name` method: replace `WHERE name = $1` with `WHERE LOWER(name) = LOWER($1) AND is_deleted = 0`
- Trait signature unchanged: `async fn find_by_name(&self, name: &str) -> anyhow::Result<Option<ProcedureType>>`

---

### Step 3 — Backend: service (R3, R4, R22)

**`src-tauri/src/context/procedure/service.rs`**

**`add_procedure_type`**:

- Normalize empty category → `None`: `let category = category.filter(|s| !s.trim().is_empty());`
- Before creation, call `self.repository.find_by_name(name.trim())` → if found: `anyhow::bail!("A procedure type with this name already exists")`

**`update_procedure_type`**:

- Guard first: `if procedure_type.id == "import-pdf" { anyhow::bail!("The reserved import-pdf type cannot be edited") }`
- Duplicate check: `find_by_name(name.trim())` → if found and `found.id != procedure_type.id` → bail duplicate

**`delete_procedure_type`**:

- Guard first: `if id == "import-pdf" { anyhow::bail!("The reserved import-pdf type cannot be deleted") }`

---

### Step 4 — Backend tests (R3, R4, R22)

**`src-tauri/src/context/procedure/service.rs`** — `#[cfg(test)]` module

Tests to add:

- `test_add_procedure_type_rejects_duplicate_name`
- `test_add_procedure_type_normalizes_empty_category`
- `test_update_procedure_type_rejects_import_pdf`
- `test_delete_procedure_type_rejects_import_pdf`
- `test_update_procedure_type_rejects_duplicate_name`
- `test_update_procedure_type_allows_same_name_same_id`

---

### Step 5 — Type synchronization

```bash
just generate-types
```

---

### Step 6 — Frontend: reserved constant (R23)

**`src/features/procedure-type/shared/types.ts`**

```ts
export const RESERVED_PROCEDURE_TYPE_ID = "import-pdf";
```

---

### Step 7 — Frontend: filter + error + retry (R23, R15)

**`src/features/procedure-type/procedure_type_list/useProcedureTypeList.ts`**

- Filter before mapping: `.filter(pt => pt.id !== RESERVED_PROCEDURE_TYPE_ID)`
- Add `error: string | null` and `retry: () => void` (direct gateway call)

---

### Step 8 — Frontend: filtered counter (R11, R23)

**`src/features/procedure-type/useProcedureTypeManager.ts`** (or equivalent file)

- Counter: `procedureTypes.filter(pt => pt.id !== RESERVED_PROCEDURE_TYPE_ID).length`

---

### Step 9 — Frontend: 5 table states (R12, R13, R15)

**`src/features/procedure-type/procedure_type_list/ProcedureTypeList.tsx`**

5 distinct `tbody` states:

1. `loading` → animated row (existing)
2. `error` → message + "Retry" button (**new** — R15)
3. `rows.length === 0 && !searchTerm` → empty message with FAB invitation (R12)
4. `sortedAndFiltered.length === 0 && searchTerm` → neutral message without invitation (R13)
5. Data rows (existing)

---

### Step 10 — Frontend: creation modal (R16)

**Create `src/features/procedure-type/create_procedure_type_modal/useCreateProcedureTypeModal.ts`**

- Migrate logic from `useAddProcedureTypePanel.ts`
- Reset form on close (`useEffect` on `isOpen`)
- Expose: `formData`, `errors`, `loading`, `handleChange`, `handleSubmit`

**Create `src/features/procedure-type/create_procedure_type_modal/CreateProcedureTypeModal.tsx`**

- Use `FormModal` (from `ui/components`)
- Reuse `ProcedureTypeForm` from `shared/`
- Props: `isOpen: boolean`, `onClose: () => void`
- Backend error → error snackbar, modal stays open (R16)
- Success → modal closed + form reset (R16)

---

### Step 11 — Frontend: ProcedureTypeManager (R16)

**`src/features/procedure-type/ProcedureTypeManager.tsx`**

- Replace `ManagerLayout` with a full-width `div` layout:
  - `ManagerHeader` (title, filtered counter, search field)
  - Scrollable `div` containing `ProcedureTypeList`
  - `FAB` (`ui/components`) positioned `fixed bottom-12 right-12`
  - `CreateProcedureTypeModal` (local `isCreateModalOpen` state)
- Remove imports `AddProcedureTypePanel` and `ManagerLayout`

---

### Step 12 — Removal of add_procedure_type_panel/

Delete:

- `src/features/procedure-type/add_procedure_type_panel/AddProcedureTypePanel.tsx`
- `src/features/procedure-type/add_procedure_type_panel/useAddProcedureTypePanel.ts`
- `src/features/procedure-type/add_procedure_type_panel/AddProcedureTypePanel.test.tsx`

---

### Step 13 — i18n (R12, R13, R15, R16)

**`src/i18n/locales/fr/procedure-type.json`** and **`src/i18n/locales/en/procedure-type.json`**

Add under `list`:

| Key              | FR                                                            | EN                                                          |
| ---------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| `list.noResults` | `"Aucun type d'acte ne correspond à votre recherche."`        | `"No procedure types match your search."`                   |
| `list.empty`     | `"Aucun type d'acte. Utilisez le bouton + pour en créer un."` | `"No procedure types yet. Use the + button to create one."` |
| `list.loadError` | `"Impossible de charger les types d'actes."`                  | `"Failed to load procedure types."`                         |
| `list.retry`     | `"Réessayer"`                                                 | `"Retry"`                                                   |

Remove obsolete keys related to the side panel (`page.addDescription`, `action.adding` if unused).

---

### Step 14 — Frontend tests

**Create `src/features/procedure-type/create_procedure_type_modal/useCreateProcedureTypeModal.test.ts`**

- Valid submission → `addProcedureType` called + form reset
- Empty name → inline error, no gateway call
- Backend error (duplicate) → error snackbar, modal stays open

**Edit `src/features/procedure-type/ProcedureTypeManager.test.tsx`**

- FAB click → creation modal opens
- Counter excludes `import-pdf`

**Edit `src/features/procedure-type/procedure_type_list/ProcedureTypeList.test.tsx`**

- Empty state (0 types, no search) → message with FAB invitation
- No results (search with no match) → neutral message without invitation
- Error state → message + "Retry" button

---

### Step 15 — Quality checks

```bash
python3 scripts/check.py
```

---

### Step 16 — Code review (`reviewer` agent)

Run the `reviewer` agent on the modified files. Display the full report. Fix the findings. Re-run until 0 finding.

---

### Step 17 — UX review (`ux-reviewer` agent)

`.tsx` files were modified → run the `ux-reviewer` agent. Display the full report. Fix the findings. Re-run until 0 finding.

---

### Step 18 — i18n check (`i18n-checker` agent)

Frontend text was added/modified → run the `i18n-checker` agent. Fix missing or hardcoded keys.

---

### Step 19 — Documentation

- `ARCHITECTURE.md` — `procedure-type/` section: note `create_procedure_type_modal/` (replaces `add_procedure_type_panel/`)
- `docs/todo.md` — remove resolved items related to `procedure-type`

---

### Step 20 — Spec checker (`spec-checker` agent)

Run the `spec-checker` agent on `docs/spec/procedure-type.md` to verify that all rules R1→R23 are implemented and covered by tests.
