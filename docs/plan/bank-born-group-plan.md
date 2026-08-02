# Plan — Correction context header + bank-born groups (BAS-110–117)

Source spec: `docs/spec/bank-statement-auto-match.md` § "Correction context and bank-born groups (110–119)"
Contract: `docs/contracts/bank-statement-auto-match-contract.md` (2026-07-31 changelog entry)
Wireframe (user-validated UI reference — **normative for P5**): https://claude.ai/code/artifact/9dc1023b-aa53-42b8-9a7b-b5705ba06d20
**UI acceptance gate**: the implemented dialogs must visually match the wireframe's three frames in BOTH themes — the P5 `/visual-proof` captures (light + dark, all hosts + procedure scope) are compared side-by-side against the wireframe before the P5 commit; any deviation is either fixed or explicitly signed off by the user. Every new element uses M3 theme tokens only (no raw colors) — the batch-1 lesson (unstyled selects invisible in one theme) must not repeat; reviewer-frontend verifies token usage. **Contrast notes from wireframe review (2026-07-31)**: muted/helper text must stay readable in dark (lighter on-surface-variant, not dimmer); the shared `Button`'s disabled state (`opacity-60` over the primary fill) renders near-illegible dark-on-purple in dark mode — the disabled primary in these dialogs must use the surface+muted treatment instead (boyscout on the shared Button disabled style if the fix is ≤ the 50-LOC/mechanical gates, else scoped locally + techdebt).

## At a glance

1. **P1 docs** — spec/contract/plan/UL (this iteration; first commit of the branch).
2. **P2 backend red** — `test-writer-backend` writes failing engine + orchestrator tests from the contract.
3. **P3 backend green** — draft engine (BAS-112/113) then validate birth (BAS-115); `just generate-types` + `npx tsc --noEmit`.
4. **P4 frontend red** — `test-writer-frontend` (with `modified_functions` list below).
5. **P5 frontend green** — context header (BAS-110), scope selector + procedure list (BAS-111/113/116/117); `/visual-proof`.
6. **P6 quality** — `spec-checker` **[HARD GATE]**, reviewer batch (frontend / backend / arch / **security** — Tauri wire shape changed), `/review-triage`, fixes commit.

Branch: `feat/bank-born-groups` off fresh `main` (never the stale shared `next`; delete leftover `origin/next` if present).

## Pinned decisions (were open in iteration 1)

- **D1 — Open-procedure predicate (BAS-112), stated literally**: `p.is_deleted = 0 AND p.fund_id == line.fund_id AND p.payment_status == Created AND p.id NOT IN (SELECT procedure_id FROM fund_payment_line WHERE is_deleted = 0) AND p.billed_amount > 0` (column is NOT NULL since migration 20260524 — no null conjunct). The anti-join is mandatory (group creation and the status flip are separate non-atomic writes — same reason `find_unreconciled_by_date_range` anti-joins).
- **D2 — Patient-name source**: a new fund-scoped repository read on the **procedure** BC: `ProcedureRepository::find_open_by_fund_with_patient(fund_id) -> Vec<OpenProcedureCandidate>` (projection: procedure id, date, billed, patient display name via JOIN patient) implementing D1 in SQL, ordered `procedure_date ASC, id ASC`. Exposed via the existing `ProcedureService` (already an orchestrator dependency — **no new orchestrator constructor dep, no DI change**). New `query_as!` ⇒ `just prepare-sqlx` step + **reviewer-sql is IN the gate list** (new SQL, no migration).
- **D3 — Error surface**: two new `BankStatementReconciliationTask` variants `ProcedureNotEligible` (subsumes unknown/soft-deleted/not-open/wrong-fund) and `ProcedureAlreadyConsumed`; mutual exclusion is a cascade, never an error.
- **D4 — ADR**: **none** — user decision 2026-07-31 ("design feature"); BAS-115 cites the REF-100 precedent instead. `GroupSource` stamping stays deferred to its techdebt entry (no schema change).

## Rules Coverage

| Rule                          | Layer(s) | Task(s)                                                                                                                                                                                                      | Test tier                           |
| ----------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| BAS-110 [unit-test-needed]    | FE       | P5: `ui/LineContextHeader.tsx` + 3 hosts (`LinkFundModal`, `AssignGroupsModal`, wizard)                                                                                                                      | RTL (3 hosts) + visual proof        |
| BAS-111 [unit-test-needed]    | FE       | P5: scope selector in `AssignGroupsModal.tsx` (labels: « Cette caisse » / « Toutes les caisses » / « Actes de la caisse »; dialog title verb « Rapprocher »); default-scope rule                             | RTL                                 |
| BAS-112                       | BE       | P3: `find_open_by_fund_with_patient` (D1/D2) + `candidate_procedures` in `finalize_line`                                                                                                                     | engine unit + SQL-backed repo test  |
| BAS-113 [unit-test-needed FE] | BE+FE    | P3: `apply_assign_procedures` + list-level exclusion + consumption; P5: submit branch + scope-switch clearing + `presentCorrection`/`presentReconciliationError` arms (also serves BAS-061/066 FE halves)    | engine unit + RTL                   |
| BAS-114                       | —        | NOT RETAINED (user decision) — no task                                                                                                                                                                       | —                                   |
| BAS-115                       | BE       | P3: born-group branch in `validate_reconciliation` per field-mapping table                                                                                                                                   | orchestrator unit (capturing mocks) |
| BAS-116 [unit-test-needed]    | FE       | P5: wizard walks past group-less AND procedure-assigned lines (queue filter); needs-group badge text becomes kind-agnostic « À rapprocher » (i18n; user-confirmed 2026-07-31)                                | RTL wizard                          |
| BAS-117                       | BE+FE    | P3: engine test — credit smaller than every open procedure stays needs-correction; validate touches procedures only per the BAS-115 field mapping. P5: negative RTL (no amount input / no create affordance) | engine unit + RTL negative          |
| BAS-068 amendment             | BE+FE    | P3: no engine change (behavior shipped 2026-07-30); P5: broaden button folded into scope selector                                                                                                            | RTL (covered by BAS-111 tests)      |
| BAS-061/066/091 amendments    | BE       | P3: settlement-item-agnostic status/balance; re-link drops procedure corrections                                                                                                                             | engine unit                         |

## Workflow TaskList

- [ ] **Setup**: read `docs/backend-rules.md`, `docs/ddd-reference.md`, `docs/error-model.md`, `docs/frontend-rules.md`, `docs/i18n-rules.md`, `docs/test_convention.md`, ADR-002/003 (non-atomic multi-writes — BAS-115 widens this window; failure handling = propagate typed errors loudly, never a silent success count, per the spec's Accepted-limitations bullet), `docs/ubiquitous-language.md` ("Open procedure" entry added in P1).
- [ ] **P1 — docs commit** (`docs(bank): spec, contract and plan for bank-born groups`).
- [ ] **P2 — `test-writer-backend`** from the contract: red baseline (`cargo test` non-zero). Coverage targets: D1 predicate (incl. anti-join case: `Created` procedure already in a group line), ordering + tiebreak, `candidate_procedures` empty while needs-link, assign happy path → Matched, overflow, wrong-fund, consumed + revert-restore, exclusion both directions (list-removal semantics: revert after exclusion restores auto-match, never the removed correction), re-link drop (BAS-066), born-group field mapping incl. `fund_reconciliation_date`/`actual_payment_amount`, stale-draft recheck at validate, loud failure on group-creation error, BAS-117 engine dead-end (credit < every billed → needs-correction), remainder-ack removal on re-assignment (revert does NOT restore it, BAS-113), born-group event emission (`FundPaymentGroupUpdated` fires per settled group via the EXISTING `update_group_status` publish at fund/service.rs:397 — no new publish; `create_group` called `is_silent=true`).
- [ ] **P3 — backend green**: implement ONLY what makes the failing tests pass — no defensive code, no anticipation of future rules.
  - `context/procedure/domain/procedure.rs`: `OpenProcedureCandidate` read model (sibling of `UnreconciledProcedure`, same file) + trait method on `ProcedureRepository` (declared in domain, implemented in `context/procedure/repository/procedure.rs`): `find_open_by_fund_with_patient` (D2).
  - `use_cases/bank_statement_reconciliation/reconciliation.rs`: wire types per contract; `WorkingLine.assigned_procedure_ids`; `apply_assign_procedures`; exclusion at correction-list level (pre-replay filter — removes the superseded assignment AND any prior `AcknowledgeRemainder` for the line, replacing the current flag-reset at reconciliation.rs:419 so revert cannot resurrect the acknowledgment); `finalize_line` settlement-item-agnostic; BAS-066 drop.
  - `error.rs`: `ProcedureNotEligible`, `ProcedureAlreadyConsumed` (+ serde-code test arm).
  - `orchestrator.rs`: pass open-procedure candidates into repos struct; `validate_reconciliation` born-group branch (create group + lines via `FundPaymentService` factory methods → push `ConfirmedMatch` → existing settle loop; procedures `Created → FundPaid`, `actual_payment_amount = billed`, `fund_reconciliation_date = line date`; group created `is_silent=true`; `FundPaymentGroupUpdated` comes from the existing `update_group_status` publish in the settle step — add no new publish; write order per BAS-115: group → transfer+link → lock → procedures last).
  - `just prepare-sqlx`.
  - Commit checkpoint (`feat(bank): draft engine learns procedure assignment` / `feat(bank): validate births the missing group`).
- [ ] **P3.5 — backend review**: `reviewer-backend` + `reviewer-arch` + `reviewer-sql` (D2 query) so a wire-reshaping finding cannot invalidate FE work; `/review-triage`; apply; THEN `just generate-types` + `npx tsc --noEmit`.
- [ ] **P4 — `test-writer-frontend`** with `modified_functions`: `LinkFundModal` (context-header mount), `AssignGroupsModal` (scope selector, split selection state, submit branch, three-action footer), `shared/candidateSelection.ts::coveredAmount` (procedure-aware), `shared/reconciliationPresenter.ts::presentCorrection` + `presentReconciliationError` (new arms), `ReconciliationWizard` (queue filter). Red baseline (vitest non-zero).
- [ ] **P5 — frontend green** (implement ONLY what makes the failing tests pass — no defensive code, no anticipation of future rules; all FE paths relative to `src/features/bank-statement-match/`):
  - `ui/LineContextHeader.tsx` (BAS-110: single line, muted-italic label, over-long labels truncate with ellipsis (`truncate`), clear bottom spacing — `mb-4`) mounted in `LinkFundModal` / `AssignGroupsModal` / wizard step.
  - `AssignGroupsModal.tsx`: three-scope segmented control (`assign-groups-scope-{fund,all,procedures}`), procedure scope gated on `line.fund_id`, default-scope rule (procedures pre-selected iff both group scopes empty and procedures exist), split `selectedGroupIds`/`selectedProcedureIds` with scope-switch clearing, seeding from `assigned_procedure_ids`, submit branch. **Three-action footer** (BAS-113 dialog-actions clause): footer-LEFT `assign-groups-submit-with-remainder` « Rapprocher avec reliquat » in a gold **warning** tone (new `warning` variant on the shared `Button` — tertiary/gold outline; distinct from red danger = reject and purple primary = normal; enabled iff selection non-empty AND covered < line amount; submits assignment then `AcknowledgeRemainder` — two corrections, one click); footer-RIGHT `Annuler` / `assign-groups-submit` « Rapprocher » (user-confirmed layout 2026-07-31, mirrors the reject-left pattern of LinkFundModal). The inline remainder row becomes informational text (no button); the standalone acknowledge affordance is removed.
  - `ui/ProcedureCandidateList.tsx`: rows `patient_name · procedure_date · billed_amount` + exact flag; same checkbox/balance wiring.
  - `ReconciliationWizard.tsx`: phase-2 queue skips lines with zero group candidates AND lines that already have assigned procedures (BAS-116 — never present the group selector over staged procedure work).
  - i18n en+fr: scope labels (FR per wireframe), error keys, correction-log arm for `AssignProcedures`; reject-button label becomes « Ignorer ce libellé » (en: "Ignore this label") and the link-fund dialog title « Associer le libellé « {{label}} » à une caisse » (en: 'Link the label “{{label}}” to a fund') in LinkFundModal + wizard (user-confirmed 2026-07-31 — accurate to the BAS-030 label-wide cascade); needs-group badge « À rapprocher ».
  - `/visual-proof`: all three hosts, light+dark, incl. procedure scope + header.
  - Commit checkpoint (`feat(bank): assign dialog gains procedure scope and context header`).
- [ ] **P6 — quality**: `just format`; `just check-full`; `reviewer-frontend` + `reviewer-security` (Tauri command payload shape changed); `/review-triage`; fixes commit; **`spec-checker` [HARD GATE] runs LAST, after the fixes commit**, over BAS-110–117 + amended 061/066/068/091; `git rm` this plan file in the final feature commit.
- [ ] **Closure judgments (explicit)**: E2E — the existing `e2e/bank-statement/entry-point.test.ts` smoke is unaffected (ids only added, none changed); no new E2E (modal-only interaction, densely RTL-covered) ⇒ `test-writer-e2e`/`reviewer-e2e` n/a. Documentation — add one sentence to ARCHITECTURE.md § "Bank statement reconciliation" describing the procedure-settlement path (fold into P6 fixes commit).

## Migrations

None. D2 is a read-only query over existing tables; `GroupSource` stamping explicitly deferred (BAS-115).

## PR Plan

- **Strategy**: 1 PR (branch `feat/bank-born-groups`).
- **Title**: `feat(bank): settle no-bordereau credits from open procedures`
- **Estimate**: BE ~450 LOC / ~8 files; FE ~400 LOC / ~11 files; tests ~400 LOC — total churn ~1250 LOC, ABOVE the ≤1000 guideline. Justification: one story (the FE is unusable without the wire and the BE unobservable without the FE); single PR CONFIRMED by user (2026-07-31) — overrun accepted, one story.
- **Ship**: usual pipeline (PR → CI + coverage → rebase-merge → release → publish) on user go.

## Out of scope (explicit)

Per-procedure paid amounts / disputes / patient creation (BAS-117 — fund-PDF flow territory); wizard procedure scope (BAS-116); auto-select (BAS-114 not retained); `GroupSource` column (tracked techdebt); credits smaller than every open procedure (accepted dead-end, BAS-117).
