# Plan — Bank Reconciliation Draft-UX Rework (BAS)

Source spec: `docs/spec/bank-statement-auto-match.md` (BAS-060→069, 090→094, 100→103 + superseded 034/037/038/040).
Source contract: `docs/contracts/bank-statement-auto-match-contract.md` (commands `compute_bank_statement_reconciliation`, `validate_bank_statement_reconciliation`; 4 superseded).

Reworks bank-statement reconciliation from a stepwise wizard into a unified document-order list backed by an **ephemeral backend draft-recompute engine**. No new migration (draft is in-memory; reuses `BankEntry` / `FundPaymentGroup` / `BankFundLabelMapping`).

---

## 1. Workflow TaskList

### Setup

- [ ] 📖 Read spec: `docs/spec/bank-statement-auto-match.md`
- [ ] 📖 Read contract: `docs/contracts/bank-statement-auto-match-contract.md`
- [ ] 📖 Read constraining ADRs: `docs/adr/001-bank-fund-label-mapping-persistence.md` (mapping upsert + `FundAssignment` rationale), `docs/adr/003-unit-of-work.md` + `docs/adr/002-overpayment-cascade-no-transaction.md` (non-atomic validate precedent), `docs/adr/008-native-dialog-modal-system.md` (correction modals)
- [ ] 📖 Read conventions: `ARCHITECTURE.md`, `docs/test_convention.md`, `docs/backend-rules.md`, `docs/ddd-reference.md`, `docs/error-model.md` (BE); `docs/frontend-rules.md`, `docs/i18n-rules.md`, `docs/frontend-visual-proof.md` (FE); `docs/reconciliation-ux-pattern.md` (the convention this feature partly overrides)

### Backend phase — **PR 1**

- [ ] ✍️ Backend test stubs (`test-writer-backend` from contract: `compute_bank_statement_reconciliation`, `validate_bank_statement_reconciliation` — red confirmed)
- [ ] 🏗️ Backend Implementation (minimal — make failing tests pass; no defensive/anticipatory code)
- [ ] 🔍 Backend Review (`reviewer-backend` + `reviewer-arch` in parallel → `/review-triage` → apply Follow-ups; **no migration** so `reviewer-sql` skipped)
- [ ] 🔗 Type Synchronization (`just generate-types`)
- [ ] 🔧 `npx tsc --noEmit` → fix TS errors from removed/added bindings only (no UI work yet)
- [ ] 🧹 `just format`
- [ ] 💾 Commit: `feat(bank): reconciliation draft engine + validate command`
- [ ] 🔀 `/create-pr` → **PR 1 (BE)**. After merge, branch FE off updated `main`.

### Frontend phase — **PR 2**

- [ ] ✍️ Frontend test stubs (`test-writer-frontend` — gateway unit, presenter unit, RTL list/modals/wizard; `modified_functions = [useBankStatementReconciliation.ts:applyCorrection, useBankStatementReconciliation.ts:revert]` for the `[unit-test-needed]` rules BAS-062/065 — red confirmed)
- [ ] 💻 Frontend Implementation (minimal — make failing tests pass)
- [ ] 📸 Visual proof (`/visual-proof` — list states: empty/loading/error + per-status rows + correction modals + wizard, light + dark)
- [ ] 🔍 Frontend Review (`reviewer-frontend` + `reviewer-arch` → `/review-triage` → apply Follow-ups)
- [ ] 🧹 `just format`
- [ ] 💾 Commit: `feat(bank): unified reconciliation list + correction modals + wizard`
- [ ] 🔀 `/create-pr` → **PR 2 (FE)**. After merge, branch E2E off updated `main`.

### Closure — **PR 3**

- [ ] ✍️ E2E scenarios (`test-writer-e2e` — critical paths: auto-match happy path, link-fund cascade, multi-group + remainder, wizard, revert, validate)
- [ ] ▶️ Run E2E suite (`npm run test:e2e` → green; main agent triages failures)
- [ ] 🔍 Cross-cutting Review (`reviewer-e2e` + `reviewer-security` (new Tauri commands + IPC) + `reviewer-infra` if any config touched — parallel → `/review-triage`)
- [ ] 📚 Documentation Update: close `docs/techdebt.md` #62 (composite credits); reconcile `docs/reconciliation-ux-pattern.md` (document-order overrides exception-first rule 3; guided wizard resolves the batch-semantics open Q); update `ARCHITECTURE.md` (new draft-recompute engine in `bank_statement_reconciliation`)
- [ ] ✅ Spec check (`spec-checker` over BAS) [HARD GATE]
- [ ] 🧹 `just format`
- [ ] 💾 Commit: `test(bank): E2E reconciliation draft flow + closure`
- [ ] 🔀 `/create-pr` → **PR 3 (E2E + closure)**

---

## 2. Detailed Implementation Plan

### Migrations

None — the draft is ephemeral (BAS-064); validate reuses existing `BankEntry` / `FundPaymentGroup` / `BankFundLabelMapping` write paths. No schema change.

### Backend — `src-tauri/src/use_cases/bank_statement_reconciliation/`

- **`reconciliation.rs`** _(new)_ — the reconciliation model + pure recompute engine:
  - Types: `BankStatementCorrection` (`LinkFund { bank_label, assignment: FundAssignment }` / `AssignGroups { line_id, group_ids }` / `AcknowledgeRemainder { line_id }`), `FundAssignment` (`Fund { fund_id } | Rejected`), `BankStatementReconciliation`, `BankStatementLine`, `BankStatementLineStatus` (`Matched/NeedsLink/NeedsGroup/Partial/Rejected/Unresolved`), `BankStatementCandidate`. All `Serialize/Deserialize/Type` (Specta).
  - `compute_reconciliation(parse_result, bank_account_id, corrections, &repos) -> Result<BankStatementReconciliation, _>`: load saved mappings + live unsettled groups → initial auto-match (reuse existing match logic, BAS-050–054) → replay corrections in order (link-fund cascade BAS-066, group consumption BAS-067, multi-group balance BAS-090/091, remainder BAS-092) → per-line status BAS-061 → candidate proposals BAS-068. Pure / read-only.
  - Rejection paths (BAS-064): `AssignmentOverflow` (BAS-094), `GroupNotEligible` (BAS-090), `GroupAlreadyConsumed` (BAS-067).
- **`orchestrator.rs`** _(modify)_ — **PR 1**: add `compute_reconciliation` + `validate_reconciliation`; keep the auto-match / resolve / save / create-transfers internals (the reconciliation engine reuses them as private helpers; the old public commands still call them). `validate_reconciliation` recomputes the reconciliation then commits: upsert mappings (BAS-035, ADR-001), N transfers per assigned group (BAS-093), procedure status + group lock (BAS-071–073). Non-atomic (ADR-002/003 precedent). **PR 2**: remove the now-superseded public `match_against_unsettled_groups` / `create_transfers` / `resolve_fund_labels` / `save_label_mappings` (the reusable internals stay, used by the reconciliation engine).
- **`api.rs`** _(modify)_ — **PR 1**: ADD the new Tauri commands `compute_bank_statement_reconciliation`, `validate_bank_statement_reconciliation`. Keep ALL existing commands (incl. the 4 to-be-superseded) so the current FE still compiles. **PR 2**: delete `resolve_bank_fund_labels`, `save_bank_fund_label_mappings`, `match_bank_statement_lines`, `create_bank_transfers_from_statement` once the FE no longer calls them.
- **`error.rs`** _(modify, PR 1)_ — add `AssignmentOverflow`, `GroupNotEligible`, `GroupAlreadyConsumed`, `LineNotFound`, `FundNotFound` to `BankStatementReconciliationTask` (per `docs/error-model.md`; no bare unit variants on the untagged composite).
- **`shared/infrastructure/specta_builder.rs`** _(modify)_ — **PR 1**: register the 2 new commands (additive). **PR 2**: remove the 4 superseded from `collect_commands!` (together with the `api.rs`/`orchestrator.rs` deletions and the FE gateway removals).

### Frontend — `src/features/bank-statement-match/`

- **`gateway.ts`** _(modify)_ — add `computeBankStatementReconciliation`, `validateBankStatementReconciliation` (positional args per bindings); **remove** `resolveBankFundLabels`, `saveBankFundLabelMappings`, `matchBankStatementLines`, `createBankTransfersFromStatement`. **PR 2 also lands the matching BE deletions** (`api.rs` / `specta_builder.rs` / `orchestrator.rs` public fns) so the old commands and their only callers vanish in the same merge — `tsc` stays green at every PR boundary.
- **`ui/useBankStatementReconciliation.ts`** _(new — replaces `useBankStatementModal.ts`)_ — owns `corrections: BankStatementCorrection[]` + the recomputed reconciliation; each apply/revert appends/drops a correction and re-calls `computeBankStatementReconciliation` (BAS-064/065); busy + typed-error state (F27); `validate()` calls `validateBankStatementReconciliation`. Keeps the account-create gate (BAS-011–017) ahead of the list.
- **`ui/ReconciliationList.tsx`** _(new — replaces `MatchResultsStep.tsx`)_ — document-order rows `fund · value · status` (BAS-060/061), summary count + filter (BAS-069), double-click → correction modal (BAS-062), top wizard button (BAS-100).
- **`ui/LinkFundModal.tsx`**, **`ui/AssignGroupsModal.tsx`**, **`ui/RemainderModal.tsx`** _(new)_ — per-line correction modals (native `<dialog>`, ADR-008). AssignGroups shows ranked candidates + live balance + overflow guard (BAS-068/090/091/094); LinkFund shows heuristic suggestion (BAS-032/036/066) + reject.
- **`ui/ReconciliationWizard.tsx`** _(new)_ — phased guided walkthrough (link-fund → assign-group, BAS-101); completion/abandon keeps corrections (BAS-103).
- **`ui/BankStatementModal.tsx`** _(modify)_ — host gate → list → done; drop `FundLabelMappingStep`, `MatchResultsStep`, `DoneStep` step machine.
- **`shared/reconciliationPresenter.ts`** _(new)_ — pure `BankStatementLineStatus`/error → i18n key + view-model (F27 layer 3). **`shared/reconciliationCorrections.ts`** _(new)_ — pure helpers to build correction commands + balance math (`.ts`, not `.tsx`).
- **Remove**: `ui/FundLabelMappingStep.tsx`, `ui/useFundLabelMappingStep.ts`, `ui/MatchResultsStep.tsx`, `ui/DoneStep.tsx` (+ their tests) — dead after the rework.
- **i18n**: new `bank` namespace keys for statuses, correction modals, wizard, summary (snake_case per i18n-rules §31).

### Rules Coverage

| Rule                | Layer              | Task                                                                                | Notes                      |
| ------------------- | ------------------ | ----------------------------------------------------------------------------------- | -------------------------- |
| BAS-060             | frontend           | `ReconciliationList.tsx`                                                            | document order             |
| BAS-061             | frontend + backend | `reconciliation.rs` `BankStatementLineStatus` + `reconciliationPresenter.ts`        | 6-status set               |
| BAS-062             | frontend + backend | `ReconciliationList.tsx` dblclick + correction modals; `reconciliation.rs` override | `[unit-test-needed]`       |
| BAS-063             | frontend + backend | `validate_reconciliation` skip-unresolved                                           |                            |
| BAS-064             | frontend + backend | `reconciliation.rs::compute_reconciliation` + `useBankStatementReconciliation.ts`   | pure recompute; busy/error |
| BAS-065             | frontend + backend | `useBankStatementReconciliation.ts` revert + recompute                              | `[unit-test-needed]`       |
| BAS-066             | frontend + backend | `reconciliation.rs` link cascade + `LinkFundModal.tsx`                              |                            |
| BAS-067             | backend            | `reconciliation.rs` group consumption                                               |                            |
| BAS-068             | frontend           | `AssignGroupsModal.tsx` candidates + broaden                                        |                            |
| BAS-069             | frontend           | `ReconciliationList.tsx` summary + filter                                           |                            |
| BAS-090             | frontend + backend | `reconciliation.rs` multi-group eligibility + `AssignGroupsModal.tsx`               |                            |
| BAS-091             | backend            | `reconciliation.rs` balance                                                         |                            |
| BAS-092             | frontend + backend | `reconciliation.rs` remainder + `RemainderModal.tsx`                                | informational only         |
| BAS-093             | backend            | `validate_reconciliation` N transfers                                               |                            |
| BAS-094             | frontend + backend | `reconciliation.rs` overflow + `AssignGroupsModal.tsx` guard                        |                            |
| BAS-100–103         | frontend (102 f+b) | `ReconciliationWizard.tsx`                                                          | phased; shares model       |
| BAS-035             | frontend + backend | `validate_reconciliation` mapping upsert                                            | ADR-001                    |
| BAS-070–073         | backend            | `validate_reconciliation` transfers + status + lock                                 | reuse existing paths       |
| BAS-034/037/038/040 | —                  | superseded; remove old step components                                              | no impl                    |

> Unchanged rules (BAS-010–033, 036, **039**, 050–054, 080) keep their existing implementation; only the call sites move into the draft engine. BAS-039 (`NoSepaCreditLines`) and BAS-022 (unparsed count) stay on the untouched `parse_bank_statement` command.

---

## 3. PR Plan

- **Strategy**: `3 PRs`
- **Estimate**: BE ~5 files / ~500 LOC; FE ~15 files / ~800 LOC; E2E ~3 scenarios + closure docs.

**PR 1 — `feat(bank): reconciliation draft engine + validate command`**

- Scope: BE only, **purely additive** — `reconciliation.rs` (new), add `compute_reconciliation` + `validate_reconciliation` to `orchestrator.rs`, add the 2 commands to `api.rs` + `specta_builder.rs`, add error variants to `error.rs`; `just generate-types`; `tsc` fix for the additive binding churn. **Keeps all 4 to-be-superseded commands registered** so the current FE compiles untouched. Terminates at the Backend-phase `/create-pr`.
- Dependency: none (branch off `main`). Cleanly mergeable alone — new bindings present and unused; the old FE keeps calling the old commands. **No FE edits in PR 1** (resolves the prior coupling contradiction: deletions are deferred wholesale to PR 2).
- Branch: `feat/bank-reconciliation-draft-ux-be`

**PR 2 — `feat(bank): unified reconciliation list + correction modals + wizard`**

- Scope: FE rework — gateway (add 2 / remove 4), `useBankStatementReconciliation`, list, 3 correction modals, wizard, presenter/corrections helpers, i18n, remove old step components; visual proof. **Plus the BE deletions** — remove the 4 superseded commands from `api.rs` / `specta_builder.rs` / `orchestrator.rs` public fns in the same PR, so the dead commands and their only callers disappear together and `tsc` stays green at the merge point. Terminates at the Frontend-phase `/create-pr`.
- Dependency: rebase off `main` after PR 1 merges (consumes new bindings).
- Branch: `feat/bank-reconciliation-draft-ux-fe`

**PR 3 — `test(bank): E2E reconciliation draft flow + closure`**

- Scope: E2E scenarios + cross-cutting review + docs closure (techdebt #62, reconcile `reconciliation-ux-pattern.md`, ARCHITECTURE) + spec-checker.
- Dependency: rebase off `main` after PR 2 merges.
- Branch: `feat/bank-reconciliation-draft-ux-e2e`
