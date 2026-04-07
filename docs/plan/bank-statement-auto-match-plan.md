# Implementation Plan — bank-statement-auto-match (R5/R6/R7/R9/R23–R28 update)

> **Context**: R1–R22 are already fully implemented. This plan covers only the new or modified rules.
> **Spec**: `docs/spec/bank-statement-auto-match-spec.md`
> **ADR**: `docs/adr/001-bank-fund-label-mapping-persistence.md`

---

## 1. Workflow Checklist

- [x] Review Architecture & Rules (`ARCHITECTURE.md`, `docs/backend-rules.md`, `docs/frontend-rules.md`)
- [x] Backend Implementation (R26: structured error for zero VIR SEPA; R9: upsert accepts `Option<String>` fund_id)
- [x] Type Synchronization (`just generate-types`) — skipped: no new Specta types introduced
- [x] Frontend Implementation (R5/R6/R7/R9/R23/R24/R25/R26/R27/R28: rework `FundLabelMappingStep` + modal flow)
- [x] Formatting & Linting (`just format` + `python3 scripts/check.py`)
- [x] Code Review (`reviewer`)
- [x] UX Review (`ux-reviewer` — .tsx modified)
- [x] i18n Review (`i18n-checker` — UI text changed)
- [x] Unit & Integration Tests
- [x] Documentation Update (`ARCHITECTURE.md` + `docs/todo.md` if needed)
- [x] Final Validation (`spec-checker` + `workflow-validator`)

---

## 2. Detailed Implementation Plan

### 2.1 Scope Summary

| Layer    | Files touched                                        | Nature |
| -------- | ---------------------------------------------------- | ------ |
| Backend  | `orchestrator.rs`, `api.rs`, `label_mapping_repo.rs` | Modify |
| Frontend | `FundLabelMappingStep.tsx`, `BankStatementModal.tsx` | Modify |
| i18n     | `fr/bank.json`, `en/bank.json`                       | Modify |

No new files need to be created. No new Tauri commands are added. No `just generate-types` is required unless R26 introduces a new typed error struct (see section 2.2.1 below — it does).

---

### 2.2 Backend

#### 2.2.1 R26 — Structured error for zero VIR SEPA lines

**File**: `src-tauri/src/use_cases/bank_statement_reconciliation/api.rs`

Current behaviour: `parse_bank_statement` always returns `Ok(BankStatementParseResult)`. If `credit_lines` is empty the frontend silently receives an empty list and the workflow may continue or stall with misleading messages.

Required change: After calling `parser::parse_bank_statement`, check `result.credit_lines.is_empty()`. If true, return a structured `Err(String)` with a well-known error code string (e.g. `"NO_VIR_SEPA_LINES"`) so the frontend can detect it and display a dedicated message (R26).

In `parse_bank_statement` handler:

- After `let result = parser::parse_bank_statement(&text);`
- Add: `if result.credit_lines.is_empty() { return Err("NO_VIR_SEPA_LINES".to_string()); }`

This is a pure backend change at the api.rs layer. The `BankStatementParseResult` struct in `parser.rs` is unchanged. No new Specta type is introduced, so `just generate-types` is **not** required for this change alone.

#### 2.2.2 R9 — `save_label_mappings` must accept rejected labels via `fund_id = "REJECTED"`

**File**: `src-tauri/src/use_cases/bank_statement_reconciliation/orchestrator.rs`

Current behaviour: `save_label_mappings` accepts `Vec<(String, String)>` tuples `(bank_label, fund_id)`. The `"REJECTED"` sentinel is already handled in `label_mapping_repo.rs::save_mapping` (converts to `None` before DB write — as per ADR-001). No orchestrator change needed for rejection storage.

However, R9 requires the frontend to send **all displayed mappings** (not just changed ones). The backend must accept confirmed (already-saved) mappings being re-sent. The current `save_mapping` implementation uses check-then-update (ADR-001 §2), so re-saving an identical value is idempotent. **No orchestrator change is required.**

The `api.rs` handler `save_bank_fund_label_mappings` currently takes `Vec<SaveLabelMappingRequest>` where `fund_id: String`. This is compatible with `"REJECTED"` being passed. **No backend change is required for R9 alone.**

Conclusion: R9 backend is already compliant. The work is entirely on the frontend.

#### 2.2.3 R5/R6 — `resolve_fund_labels` already transmits all data

**File**: `src-tauri/src/use_cases/bank_statement_reconciliation/orchestrator.rs`

Current behaviour: `resolve_fund_labels` already returns `FundLabelResolution` for every unique label. For confirmed labels it sets `is_confirmed: true`, `fund_id: Some(...)`, `suggested_fund_id: None`. For unknown labels it sets `is_confirmed: false`, `fund_id: None`, `suggested_fund_id: Option<...>`.

R5 requires confirmed mappings are always transmitted (no silent skip). The backend already does this. **No backend change required.**

R6 documents the heuristic algorithm. The algorithm in `suggest_fund()` already implements both steps (CPAM/CAISSE prefix extraction + fuzzy name matching). The function correctly returns `suggested_fund_id` and `suggested_fund_name` as informational fields. **No backend change required.**

---

### 2.3 Type Synchronization

Run `just generate-types` after the backend change in 2.2.1 **only if** the `Err` string change alters any exported type. Since the change is a runtime error string (not a new Specta-exported struct), `just generate-types` is not required for backend-only changes in this plan.

However, as a mandatory process step, run it before starting frontend work to ensure `bindings.ts` is current.

---

### 2.4 Frontend

All frontend work is in `src/features/bank-statement-match/`.

#### 2.4.1 `FundLabelMappingStep.tsx` — complete rewrite of component logic

**File**: `src/features/bank-statement-match/ui/FundLabelMappingStep.tsx`

Current problems:

1. Filters to only `!r.is_confirmed` (violates R7)
2. Pre-selects `suggested_fund_id` in `useState` initializer (violates R6/R23)
3. `allMapped` only checks the filtered `unmapped` list (would pass trivially once R7 is fixed)
4. Button is at the bottom, not fixed at top (violates R24)
5. No suggestion hint text below field (R28 not implemented)
6. No two-block ordering: unknown first alphabetically, then confirmed alphabetically (violates R27)

Required changes:

**R7 — Show ALL labels:**

- Remove the `unmapped` filter. Replace `const unmapped = resolutions.filter((r) => !r.is_confirmed)` with `const allResolutions = resolutions` (use the full array throughout).

**R23 — Empty field for unknown labels:**

- In `useState` initializer, do NOT pre-populate `suggested_fund_id`. Only pre-populate confirmed mappings: for each resolution where `r.is_confirmed === true`, set `initial.set(r.bank_label, r.fund_id ?? "REJECTED")` (mapping `null` fund_id to the `"REJECTED"` sentinel). Unknown labels start with no entry in the map (empty select).

**R25 — "Accepter" disabled until all labels have a selection:**

- `allMapped` must check ALL resolutions (not just unmapped): `const allMapped = allResolutions.every((r) => selections.has(r.bank_label))`.

**R24 — "Accepter" button fixed at top:**

- Move the button out of the bottom `<div>` and place it in a sticky/fixed header section above the label list. Use `sticky top-0 z-10 bg-surface` or equivalent M3-compliant styling so it remains visible during scroll.
- The button renders: `<Button onClick={handleConfirm} variant="primary" disabled={!allMapped || isProcessing}>`. Text: use new i18n key `labelMapping.accept` (see 2.5).

**R27 — Two-block display order:**

- Before rendering, split `allResolutions` into two arrays:
  - `unknownLabels`: `r.is_confirmed === false`, sorted alphabetically by `r.bank_label`
  - `confirmedLabels`: `r.is_confirmed === true`, sorted alphabetically by `r.bank_label`
- Render `[...unknownLabels, ...confirmedLabels]` in that order with a visual separator or section header between the two blocks. Add i18n keys for section headings: `labelMapping.sectionUnknown` and `labelMapping.sectionConfirmed`.

**R28 — Suggestion as hint text, never pre-selected:**

- The hint paragraph already exists in the JSX: `resolution.suggested_fund_name && !isRejected`. This is correct for display.
- Ensure it reads from `resolution.suggested_fund_name` (backend field) and is shown only when `!isRejected`.
- The hint is now strictly informational text below the `<select>`. The `<select>` initial value is always `""` for unknown labels (R23 ensures no pre-selection).

**R9 — `onConfirm` must pass ALL displayed mappings:**

- `handleConfirm` currently calls `onConfirm(selections)`. The `selections` map now contains ALL labels (both unknown and confirmed, since confirmed labels are pre-seeded in `useState`). This is correct once R23's init logic is applied.
- Signature of `onConfirm` prop remains `(mappings: Map<string, string>) => void`.

**Updated `FundLabelMappingStepProps` interface:**

- No interface change needed. `resolutions: FundLabelResolution[]` still receives the full list from the modal.

#### 2.4.2 `BankStatementModal.tsx` — flow changes for R5/R7/R9/R26

**File**: `src/features/bank-statement-match/ui/BankStatementModal.tsx`

**R7 — Always show label-mapping step:**
Current code (lines 144–151):

```
const unmapped = resolutions.filter((r) => !r.is_confirmed && !r.is_rejected);
if (unmapped.length > 0) {
  setStep("label-mapping");
} else {
  await proceedToMatching(parsed, resolutions);
}
```

Required change: Remove the conditional skip. Always set `setStep("label-mapping")` after resolving labels. The step now shows confirmed labels too (handled in `FundLabelMappingStep`). Delete the `unmapped` filter and the `else` branch entirely.

**R5 — Confirmed mappings transmitted for pre-fill:**
The `handleLabelMappingConfirm` callback receives the full `selections` map (all labels). The `updatedResolutions` computation must handle confirmed labels that were not in the old `mappings` argument (since they were previously skipped). Update the logic:

- When building `updatedResolutions`, apply the `selections` entry for every resolution (not only those where `newFundId` is truthy), since confirmed labels now come through with their pre-seeded values.

**R9 — Save ALL mappings (not just changed ones):**
Current code (lines 172–179) only saves mappings from `newMappings`, which comes from `Array.from(mappings.entries())`. Since `handleLabelMappingConfirm` now receives all labels (including pre-confirmed ones), `newMappings` will include all of them. The `if (newMappings.length > 0)` guard remains valid. No additional filtering needed — sending confirmed mappings again is idempotent on the backend (ADR-001 §2 check-then-update).

**R26 — Handle `NO_VIR_SEPA_LINES` error:**
In the `loadAndParse` effect (lines 111–162), the `parseBankStatement` call can now throw an error with message `"NO_VIR_SEPA_LINES"`. Detect this specific error code and display a dedicated user-facing message. Add a branch:

```typescript
if (err instanceof Error && err.message === "NO_VIR_SEPA_LINES") {
  setError(t("statement.modal.noVirSepaLines"));
  setStep("error");
  return;
}
```

This must be placed in the catch block of `loadAndParse`, before the generic error handler. The workflow stops at this point — no further steps are accessible (R26 satisfied).

#### 2.4.3 `gateway.ts` — no changes needed

The `parseBankStatement` gateway function already propagates the error from the backend (`throw new Error(result.error)`). No change required.

The `saveBankFundLabelMappings` gateway function already accepts `SaveLabelMappingRequest[]` with `fund_id: string`. It supports `"REJECTED"` as a string value. No change required.

---

### 2.5 i18n

**Files**: `src/i18n/locales/fr/bank.json` and `src/i18n/locales/en/bank.json`

Keys to add under `labelMapping`:

| Key                             | French                      | English            |
| ------------------------------- | --------------------------- | ------------------ |
| `labelMapping.accept`           | `"Accepter"`                | `"Accept"`         |
| `labelMapping.sectionUnknown`   | `"Labels inconnus"`         | `"Unknown labels"` |
| `labelMapping.sectionConfirmed` | `"Labels déjà enregistrés"` | `"Saved labels"`   |

Keys to add under `statement.modal`:

| Key                              | French                                                                                                                               | English                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `statement.modal.noVirSepaLines` | `"Le relevé ne contient aucune ligne VIR SEPA. Vérifiez que le fichier est bien un relevé de compte comportant des virements SEPA."` | `"The statement contains no VIR SEPA lines. Please check that the file is a bank statement with SEPA transfers."` |

Update existing keys:

- `labelMapping.title` (currently "Labels non reconnus" / "Unrecognised labels"): update to reflect that ALL labels are shown, not only unknown ones. Suggestion: `"Associations labels → organismes"` / `"Label → fund associations"`.
- `labelMapping.description`: update to match new behaviour (confirmed labels shown pre-filled, unknown shown empty). New FR: `"Les labels suivants apparaissent sur le relevé. Les associations déjà enregistrées sont pré-remplies — vérifiez-les et complétez les labels inconnus avant de valider."` New EN: `"The following labels appear on the statement. Saved associations are pre-filled — review them and complete the unknown labels before confirming."`.

---

### 2.6 Tests

**Backend test** (`orchestrator.rs` — `#[cfg(test)]` module):

- Add test `test_save_label_mappings_idempotent`: saves a mapping twice and verifies only one row exists in the repo (verifying ADR-001 §2 check-then-update). This protects R9 re-sending confirmed labels.

**Frontend tests** (colocated in `src/features/bank-statement-match/`):

- Add `FundLabelMappingStep.test.tsx` (or `.test.ts` with `renderHook`) covering:
  - **R7**: with `resolutions` containing both confirmed and unknown entries, both are rendered.
  - **R23**: unknown labels render with empty `<select>` value (no pre-selection).
  - **R25**: "Accepter" button is disabled when an unknown label has no selection; enabled once all labels have a value.
  - **R27**: confirmed labels appear after unknown labels in the DOM; within each block, order is alphabetical.
  - **R28**: hint text is shown below the field only when `suggested_fund_name` is present and the label is not rejected.

**Note on `renderHook` rule (F19)**: Do not create objects or functions inside the render callback. All mock `resolutions` arrays must be defined as stable constants outside of `renderHook`.

---

## 3. Rules Coverage Table

| Rule      | Layer              | File(s)                                                            | Task                                                                                                                     |
| --------- | ------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| R5 (mod)  | Frontend           | `BankStatementModal.tsx`                                           | Always show label-mapping step; pre-seed confirmed values in `FundLabelMappingStep` init                                 |
| R6 (mod)  | Frontend           | `FundLabelMappingStep.tsx`                                         | Remove pre-selection of `suggested_fund_id` in `useState` initializer                                                    |
| R7 (mod)  | Frontend           | `FundLabelMappingStep.tsx`, `BankStatementModal.tsx`               | Remove `unmapped` filter; always render all resolutions; always show mapping step                                        |
| R9 (mod)  | Frontend           | `FundLabelMappingStep.tsx`, `BankStatementModal.tsx`               | Send ALL mappings on confirm; pre-seed confirmed in `selections` state so full map is transmitted                        |
| R23 (new) | Frontend           | `FundLabelMappingStep.tsx`                                         | `useState` init: unknown labels have no entry in `selections` map; select value defaults to `""`                         |
| R24 (new) | Frontend           | `FundLabelMappingStep.tsx`                                         | "Accepter" button moved to sticky top position in the component                                                          |
| R25 (new) | Frontend           | `FundLabelMappingStep.tsx`                                         | `allMapped` checks ALL resolutions; button disabled until all have a selection                                           |
| R26 (new) | Backend + Frontend | `api.rs`, `BankStatementModal.tsx`, `fr/bank.json`, `en/bank.json` | Backend returns `Err("NO_VIR_SEPA_LINES")` when `credit_lines` is empty; frontend catches and displays dedicated message |
| R27 (new) | Frontend           | `FundLabelMappingStep.tsx`                                         | Split into two sorted blocks: unknown first (alpha), confirmed second (alpha)                                            |
| R28 (new) | Frontend           | `FundLabelMappingStep.tsx`, `fr/bank.json`, `en/bank.json`         | Hint text below field from `suggested_fund_name`; nothing shown if absent; never pre-selected                            |

---

## 4. Change Impact Summary

### Backend (1 file changed)

**`src-tauri/src/use_cases/bank_statement_reconciliation/api.rs`**

- In `parse_bank_statement`: add zero-lines guard returning `Err("NO_VIR_SEPA_LINES".to_string())`.

### Frontend (2 files changed)

**`src/features/bank-statement-match/ui/FundLabelMappingStep.tsx`**

- Remove `unmapped` filter; work with full `resolutions` array.
- `useState` init: pre-seed confirmed labels only (not suggestions).
- Compute `allMapped` over full list.
- Move "Accepter" button to sticky top.
- Two-block ordered render (unknown alpha first, confirmed alpha second).
- Hint text shown only when `suggested_fund_name` present and not rejected.

**`src/features/bank-statement-match/ui/BankStatementModal.tsx`**

- Always navigate to `"label-mapping"` step after resolving labels (remove skip logic).
- Handle `"NO_VIR_SEPA_LINES"` error in `loadAndParse` catch block with dedicated i18n message.
- `handleLabelMappingConfirm`: no guard filtering out zero-length new mappings from full list.

### i18n (2 files changed)

**`src/i18n/locales/fr/bank.json`** and **`src/i18n/locales/en/bank.json`**

- Add `labelMapping.accept`, `labelMapping.sectionUnknown`, `labelMapping.sectionConfirmed`.
- Add `statement.modal.noVirSepaLines`.
- Update `labelMapping.title` and `labelMapping.description` to reflect all-labels behaviour.
