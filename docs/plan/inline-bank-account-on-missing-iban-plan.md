# Implementation Plan — Inline bank-account creation when IBAN is unknown

> Spec: [docs/spec/bank-statement-auto-match.md](../spec/bank-statement-auto-match.md) — rules **BAS-010..017**
> Cross-spec: [docs/spec/bank-account.md](../spec/bank-account.md) — **R5** (IBAN uniqueness across soft-deleted)
> Contracts: [bank-contract.md](../contracts/bank-contract.md), [bank-statement-auto-match-contract.md](../contracts/bank-statement-auto-match-contract.md)
> Profile: `tauri` (per `.claude/kit-profile`)

---

## Summary

When the IBAN extracted from a PDF bank statement does not match any existing bank account, the auto-match modal currently dead-ends on a "no-account" message. This plan replaces the dead-end with an **inline create form** (IBAN read-only pre-filled, name required) inside the same modal. On submit, the existing `createBankAccount` gateway call is invoked; on success the workflow continues into label-mapping with the freshly created account; on failure the backend message is shown inline.

Two layers of work:

1. **Backend** — enforce `R5` (IBAN uniqueness across all accounts, including soft-deleted) on `create_bank_account` and `update_bank_account`. Surface a structured `IbanAlreadyUsed` failure that bubbles up to the frontend as the error string.
2. **Frontend** — replace the `"no-account"` step of `useBankStatementModal` with a `"create-account"` step driving the inline form, wire submit to the existing `bank-account/gateway.ts#createBankAccount`, and route the new account into the existing `proceedToMatching` flow.

No new Tauri command. No new database column. The existing partial unique index `idx_bank_account_iban_active` does not cover soft-deleted rows — enforcement happens at the **service layer** via a repository method that scans the full table (including soft-deleted).

---

## 1. Workflow TaskList (Workflow A — full feature)

- [ ] Review architecture & rules ([ARCHITECTURE.md](../../ARCHITECTURE.md), [docs/backend-rules.md](../backend-rules.md), [docs/frontend-rules.md](../frontend-rules.md))
- [ ] Backend test stubs (`test-writer-backend` — contract entries `create_bank_account`, `update_bank_account` for the new `IbanAlreadyUsed` error; red confirmed)
- [ ] Backend implementation (minimal — make failing tests pass, green confirmed)
- [ ] `just format` (rustfmt + clippy --fix)
- [ ] Backend review (`reviewer-backend` → fix issues)
- [ ] Type synchronization (`just generate-types`)
- [ ] Compilation fixup (TypeScript errors from new bindings only — no UI work)
- [ ] `just check` — TypeScript clean
- [ ] **Commit: backend layer** — suggested title `feat(bank): enforce IBAN uniqueness across soft-deleted accounts`
- [ ] Frontend test stubs (`test-writer-frontend` — contract entry `resolve_bank_account_from_iban` (None branch) + `modified_functions: [useBankStatementModal.ts:loadAndParse, useBankStatementModal.ts:handleCreateAccountSubmit]`; red confirmed)
- [ ] Frontend implementation (minimal — make failing tests pass, green confirmed)
- [ ] `just format`
- [ ] Frontend review (`reviewer-frontend` → fix issues)
- [ ] Visual proof (`/visual-proof` — capture inline-create form in light + dark mode, after reviewer-frontend pass; stage screenshots before commit)
- [ ] **Commit: frontend layer** — suggested title `feat(bank-statement-match): inline bank-account creation when IBAN is unknown`
- [ ] E2E tests (`test-writer-e2e` — covers BAS-010..017 happy path + cancel; run `/setup-e2e` first if not done; green confirmed)
- [ ] Frontend review on E2E test files (`reviewer-frontend` → fix issues)
- [ ] **Commit: E2E tests** — suggested title `test(bank-statement-match): e2e for inline bank-account creation`
- [ ] Cross-cutting review (`reviewer-arch` always; **no** `reviewer-sql` — no migration; **no** `reviewer-infra` — no config change)
- [ ] Documentation update — append rule mapping to `ARCHITECTURE.md` if needed; add `docs/todo.md` follow-ups in English (e.g. "consider widening DB index for IBAN uniqueness across soft-deleted rows")
- [ ] Spec check (`spec-checker`)
- [ ] **Commit: tests & docs** — suggested title `docs(bank-statement-match): track IBAN uniqueness implementation notes`

> No `reviewer-security` is required: no new Tauri command, no new capability, no IPC surface change.

---

## 2. Detailed Implementation Plan

### 2.1 Migrations

**None.** R5 is enforced at the service layer (see backend tasks). The existing partial unique index `idx_bank_account_iban_active` (init migration line 121) only covers active rows by design; widening it to cover soft-deleted rows would break the soft-delete contract for accounts whose IBAN was later reused after deletion. Service-layer enforcement keeps the rule stable while preserving the index semantics.

> Add a `docs/todo.md` entry: "Bank-account IBAN uniqueness across soft-deleted rows is enforced in the service layer (BAS-013, R5). Reconsider whether a DB-level CHECK or trigger is preferable once SQLite version is upgraded."

### 2.2 Backend

**Bounded context:** `src-tauri/src/context/bank/`

#### 2.2.1 Repository — extend trait + impl

File: `src-tauri/src/context/bank/repository/bank_account.rs`

- Add to the `BankAccountRepository` trait (line 9):
  ```rust
  async fn find_by_iban_including_deleted(&self, iban: &str) -> anyhow::Result<Option<BankAccount>>;
  ```
- Implement on `SqliteBankAccountRepository` — same query as `find_by_iban` but **without** the `is_deleted = 0` clause:
  ```sql
  SELECT id, name, iban FROM bank_account WHERE iban = $1
  ```
- Update **all** existing mock implementations of the trait (search `find_by_iban` — 4 mocks across `service.rs`, `use_cases/bank_statement_reconciliation/orchestrator.rs`, `use_cases/overpayment/orchestrator.rs`) to also implement the new method, returning `Ok(None)` by default.
- Inline `#[cfg(test)]` test: `test_find_by_iban_including_deleted_returns_soft_deleted_row` — create account with IBAN, soft-delete it, assert `find_by_iban` returns `None` and `find_by_iban_including_deleted` returns `Some`.

> ADR alignment: ADR-002 (soft-delete) — repository must not bypass soft-delete on read paths. The new method is the documented exception for uniqueness checks.

#### 2.2.2 Service — enforce R5 on create + update

File: `src-tauri/src/context/bank/service.rs`

- In `BankAccountService::create_account` (line 141), **before** calling the factory:
  - When `iban` is `Some(non-empty after trimming)`, call `self.repository.find_by_iban_including_deleted(&trimmed_iban)`.
  - If a row is returned, `anyhow::bail!("IbanAlreadyUsed: {}", trimmed_iban)`.
- In `BankAccountService::update_account` (line 176), after the cash-protection guard and **before** persisting:
  - When `iban` is `Some(non-empty)`, call `self.repository.find_by_iban_including_deleted(&trimmed_iban)`.
  - If the returned row's `id` is **different** from the current `id` argument, `anyhow::bail!("IbanAlreadyUsed: {}", trimmed_iban)`. (Self-match must NOT trip the rule — editing the name without changing the IBAN must succeed.)
- Trim & strip-spaces logic must mirror `BankAccount::new` (ADR — IBAN normalisation: `.trim().replace(' ', "")`). Extract a shared helper `fn normalize_iban(raw: Option<String>) -> Option<String>` in the service (or reuse the factory's behaviour by constructing a temporary `BankAccount` first — pick whichever the test-writer-backend stubs converge on).
- Inline `#[cfg(test)]` tests:
  - `test_create_account_rejects_duplicate_iban_active` — repo mock returns `Some(active account)` from `find_by_iban_including_deleted`; service errors with `"IbanAlreadyUsed"`.
  - `test_create_account_rejects_duplicate_iban_soft_deleted` — same but the existing row is soft-deleted; still rejected.
  - `test_create_account_allows_no_iban` — `iban = None`; uniqueness check is skipped.
  - `test_update_account_rejects_iban_used_by_another_account` — repo returns `Some` row with **different** id; rejected.
  - `test_update_account_allows_self_match_iban` — repo returns `Some` row whose id **matches** the account being edited; succeeds.

#### 2.2.3 API — no signature change

File: `src-tauri/src/context/bank/api.rs`

- No code change. The `Result<T, String>` already propagates the `anyhow!` chain via `format!("{:#}", e)` (lines 90, 117). The frontend receives the prefix `IbanAlreadyUsed: …` in the error string — this is the contract surface for `IbanAlreadyUsed`.

#### 2.2.4 Specta builder

File: `src-tauri/src/core/specta_builder.rs`

- No change. No new command.

### 2.3 Type synchronization

- Run `just generate-types`.
- No type change is expected (no new struct, no new enum). Verify `src/bindings.ts` diff is empty before committing the backend layer; if non-empty, investigate before proceeding.

### 2.4 Frontend

**Feature module:** `src/features/bank-statement-match/`

#### 2.4.1 Hook — replace `no-account` step

File: `src/features/bank-statement-match/ui/useBankStatementModal.ts`

- Update the `Step` union (line 19): replace `"no-account"` with `"create-account"`.
- Add new state:
  ```ts
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  ```
- In `loadAndParse` (line 138), the `if (!account)` branch (line 158) must transition to `setStep("create-account")` instead of `"no-account"`.
- New callback `handleCreateAccountSubmit` (mirrors `useEditBankAccountModal.handleSubmit` shape):
  - Trim `createName`; if empty, set `createError` to the i18n validation message and bail.
  - `setIsCreatingAccount(true); setCreateError(null);`
  - Import `createBankAccount` from `./gateway` (the local feature gateway re-exports it — see §2.4.5).
  - Call `createBankAccount(name, parseResult.iban)`.
  - On `result.success`: store the new account via `setBankAccount(result.data)`, fetch labels via `resolveBankFundLabels(result.data.id, parsed.credit_lines.map(l => l.label))`, set resolutions, transition to `"label-mapping"`.
  - On `result.success === false`: `setCreateError(result.error)` — keep the form open, preserve `createName`.
  - `finally { setIsCreatingAccount(false); }`.
- New callback `handleCreateNameChange(value: string)` — set `createName`; clear `createError` if non-null (mirrors `useEditBankAccountModal.handleChange`).
- Cancellation: there is no special handler — the modal's existing `onClose` already closes the modal entirely; the parent (`BankStatementPage` / shell) is the host. **BAS-017** is satisfied as long as we render the same close affordances on the new step.
- Return surface adds: `createName`, `createError`, `isCreatingAccount`, `handleCreateNameChange`, `handleCreateAccountSubmit`, plus the pre-filled `iban` from `parseResult` (already exposed).

> Frontend rule **F19**: extract any inline factories used by `renderHook` test setup into stable references.
> Frontend rule **F20**: the existing `let isMounted = true` cleanup pattern in `loadAndParse` must be preserved when adding the `create-account` branch.

#### 2.4.2 Component — render the inline form

File: `src/features/bank-statement-match/ui/BankStatementModal.tsx`

- Remove the `step === "no-account"` block (lines 68–80).
- Remove `"no-account"` from the footer's close-button condition (line 132).
- Add a new block for `step === "create-account"`:
  - Two `TextField`s:
    - IBAN — `value={parseResult.iban}`, `disabled`, `readOnly`. Use the existing translation `t("statement.modal.createAccount.iban")` (new key).
    - Name — `value={createName}`, `onChange={(e) => handleCreateNameChange(e.target.value)}`, `disabled={isCreatingAccount}`. The TextField does not own an error prop here — the validation message is rendered as an inline `<p role="alert">` below the form (single shared error slot, see below).
  - Inline error block below the form: `{createError && <p role="alert" className="text-m3-error text-sm">{createError}</p>}`.
  - Footer in this branch holds two buttons:
    - **Submit**: `onClick={handleCreateAccountSubmit}`, `loading={isCreatingAccount}`, `disabled={isCreatingAccount}`, label `t("statement.modal.createAccount.submit")` / loading label `t("statement.modal.createAccount.submitting")`.
    - **Cancel**: `onClick={onClose}`, `variant="secondary"`, `disabled={isCreatingAccount}`, label `t("statement.modal.createAccount.cancel")`.
  - The footer condition for the **shared** Cancel/Close button row (lines 132, 138) must be amended to **exclude** `"create-account"` so the new branch renders its own footer; mirror the pattern already used for `"label-mapping"` (line 119).

> Frontend rule **F11**: reuse `TextField` from `@/ui/components/field` and `Button` from `@/ui/components/button` — do not introduce a new generic component.
> Frontend rule **F16**: every visible string must come from i18n.

#### 2.4.3 Reuse — do NOT import `BankAccountForm`

The shared `BankAccountForm` (`src/features/bank-account/shared/BankAccountForm.tsx`) renders **both** name + IBAN fields with both editable. Importing it from `bank-statement-match` would also violate **F23** (cross-feature import outside `router.tsx`/`shell/`). Render the two `TextField`s directly inside `BankStatementModal.tsx` to keep the IBAN read-only and stay within the bounded context.

#### 2.4.4 i18n

Files: `src/i18n/locales/{en,fr}/bank.json`

- **Remove** the `statement.modal.noAccount` block (lines 45–49 in en).
- **Add** under `statement.modal`:
  ```json
  "createAccount": {
    "title": "Create the missing bank account",
    "description": "The IBAN {{iban}} from the statement is unknown. Add a name and confirm to continue the import.",
    "ibanLabel": "IBAN",
    "nameLabel": "Account name",
    "namePlaceholder": "e.g. Cabinet — main account",
    "nameRequired": "Account name is required",
    "submit": "Create and continue",
    "submitting": "Creating...",
    "cancel": "Cancel and abandon import"
  }
  ```
- French equivalents in `fr/bank.json`.

#### 2.4.5 Gateway — re-export `createBankAccount`

File: `src/features/bank-statement-match/gateway.ts`

Add a re-export so the modal hook stays within its own feature boundary (respects F23 by construction — no cross-feature import in hooks/components):

```ts
export { createBankAccount } from "@/features/bank-account/gateway";
```

This is the smallest possible cross-context surface — three lines, no wrapper logic, no behaviour drift. The hook in §2.4.1 imports `createBankAccount` from `./gateway` like every other gateway call in the feature.

### 2.5 Rules Coverage

| Rule    | Scope    | Layer / file                                                                                    | Task                                                                                                         | Notes                  |
| ------- | -------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------- |
| BAS-010 | backend  | `bank/api.rs::resolve_bank_account_from_iban` (existing)                                        | No code change — description-only update in contract                                                         | Already returns `None` |
| BAS-011 | frontend | `bank-statement-match/ui/BankStatementModal.tsx`, `useBankStatementModal.ts`                    | Replace `"no-account"` step with `"create-account"` rendering inline form                                    |                        |
| BAS-012 | frontend | `BankStatementModal.tsx`                                                                        | Two fields: IBAN read-only/pre-filled from `parseResult.iban`, Name required + non-empty after trim          |                        |
| BAS-013 | backend  | `bank/service.rs::create_account` + `repository::find_by_iban_including_deleted`                | R5 — reject IBAN used by any account incl. soft-deleted; emit `IbanAlreadyUsed: …`                           | Cross-spec: R5         |
| BAS-014 | frontend | `useBankStatementModal.ts::handleCreateAccountSubmit`                                           | On success: `setBankAccount`, fetch resolutions, transition to `"label-mapping"`                             | `[unit-test-needed]`   |
| BAS-015 | frontend | `useBankStatementModal.ts::isCreatingAccount` + `BankStatementModal.tsx`                        | Disable fields + Submit `loading` + ignore re-submits while pending                                          |                        |
| BAS-016 | frontend | `useBankStatementModal.ts::handleCreateAccountSubmit` (catch branch) + `BankStatementModal.tsx` | On error: `setCreateError(result.error)`, render inline `<p role="alert">` below form, preserve `createName` | `[unit-test-needed]`   |
| BAS-017 | frontend | `BankStatementModal.tsx`                                                                        | Cancel button + close icon both call `onClose` — modal closes entirely, no fallback dead-end                 |                        |
| R5      | backend  | `bank/service.rs::create_account` + `update_account`                                            | IBAN uniqueness across soft-deleted; self-match allowed on update                                            |                        |

#### Modified-function coverage (for `test-writer-frontend`)

The two rules below modify existing functions and are not covered by a contract entry. Pass them as `modified_functions` when invoking `test-writer-frontend`:

```
modified_functions: [
  "src/features/bank-statement-match/ui/useBankStatementModal.ts:loadAndParse  (no-account → create-account branch)",
  "src/features/bank-statement-match/ui/useBankStatementModal.ts:handleCreateAccountSubmit  (new — covers BAS-014, BAS-015, BAS-016)"
]
```

### 2.6 E2E coverage (Tauri profile)

File: `e2e/bank-account/bank-statement-inline-create.test.ts` (new)

- Seed: existing accounts have IBAN `FR76OTHER...`; the test PDF used in fixtures has IBAN `FR76NEW...`.
- Happy path: open import modal → page lands on `create-account` step → fill name → click Submit → assert label-mapping step renders.
- Error path: enter an IBAN that already exists (use a fixture PDF whose IBAN matches the seed) → backend `IbanAlreadyUsed` surfaces inline → form remains open.
- Cancel path: open `create-account` step → click Cancel → modal disappears, no account created.

> The test uses the same `setReactInputValue` helper pattern as `e2e/bank-account/bank-account.test.ts`.

---

## 3. Order of work — quick reference

1. **Backend tests red** → backend impl green → format → reviewer-backend → `just generate-types` (no diff expected) → `just check` → **commit backend**.
2. **Frontend tests red** → frontend impl green → format → reviewer-frontend → `/visual-proof` → **commit frontend**.
3. **E2E tests** → reviewer-frontend on test files → **commit e2e**.
4. **reviewer-arch** → docs + todo → spec-checker → **commit tests & docs**.

Minimal-implementation gate: each implementation step writes only what is needed to make the failing tests pass — no defensive code, no anticipation of future BAS rules, no changes to `find_by_iban` semantics outside the new `find_by_iban_including_deleted` method.
