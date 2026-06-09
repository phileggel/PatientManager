# Tech Debt

Observations of code smells, inconsistencies, and brittle patterns. Not commitments — tech-debt entries describe _what's odd_, not _what to do_. For action items see `docs/todo.md`.

`whats-next` reads from this file; entries surface as work candidates labelled with their date.

---

<!-- entries removed when resolved; this file is otherwise the running observation log -->

## 2026-05-27 — `FundService::validate_batch` repeats the patient `validate_batch` DTO anti-pattern

**Found by:** reviewer-backend (`refactor/typed-errors-fund-bank` @ `ea606ad`)

**Where:** `src-tauri/src/context/fund/service.rs:131-134` — inside `FundService::validate_batch`, the per-candidate `find_fund_by_identifier` `Err(e)` arm builds `result.error = Some(format!("Database error checking identifier: {}", e))`, folding the raw `anyhow::Error` Display into the `FundValidationResult.error` DTO field. Skips `tracing::error!` and bypasses `FundError::DatabaseError` translation.

**Observation:** Mirror image of the existing 2026-05-27 patient/service.rs:140 entry. The two `validate_batch` paths share the same DTO-shape limitation: `error: Option<String>` carries a raw repo-error string on the wire. Both resolve together when PR 3 (use-case composites) reshapes the `*ValidationResult.error` field into a typed variant.

---

## 2026-05-27 — `DatabaseError` discriminant collision between `BankError` and `FundError`

**Found by:** reviewer-backend (`refactor/typed-errors-fund-bank` @ `ea606ad`)

**Where:** `src-tauri/src/context/{bank,fund}/error.rs` — both enums emit wire code `{ "code": "DatabaseError" }` for the infra catch-all variant.

**Observation:** Per `docs/error-model.md` § Anti-patterns: "Two wrapper variants in a composite whose enums share a `code` discriminant" silently collide under `#[serde(untagged)]` — the first arm wins, the second is unreachable. PR 3-4 will wrap `BankError` + `FundError` (and other BCs) inside `{UseCase}Error` composites. Each composite must move `DatabaseError` into its `{UseCase}Task` sub-enum (single catch-all) rather than wrap both BC enums via `#[from]` — otherwise the second wrapper's `DatabaseError` is unreachable.

---

## 2026-05-27 — `bank_entry_service` repository trait still validates on the create path (`persist_transfer` cleanup follow-up)

**Found by:** reviewer-backend (`refactor/typed-errors-fund-bank` @ `ea606ad`); the downcast it flagged was resolved in commit 2 — this entry is the residual cleanup.

**Where:** `src-tauri/src/context/bank/domain/bank_entry_repo.rs` — trait still exposes both `create_transfer(transfer: BankEntry)` and `persist_transfer(transfer: BankEntry)`. After moving `BankEntry::new` to the service in this PR, both methods have identical bodies (no validation, just persist). The semantic distinction ("bypass validation for refund flow") moved upstream when validation moved to the service.

**Observation:** The trait carries one redundant method. Consolidating to a single `persist` method requires renaming the refund use-case call site and the wire-bound `BankEntryService::create_transfer` to match. Mechanical but multi-file; defer to a follow-up cleanup PR.

---

## 2026-05-27 — `formatBankError` ownership: presenter lives in `bank-account` but two features consume it

**Found by:** reviewer-arch (`refactor/typed-errors-fund-bank` @ `ea606ad`)

**Where:** `src/features/bank-account/shared/presenter.ts` (defines `formatBankError`); consumed by `src/features/bank-transfer/useBankTransferOperations.ts` and `src/features/bank-statement-match/ui/useBankStatementModal.ts` via cross-feature primitive imports.

**Observation:** `BankError` is a BC type — it belongs to neither feature alone. The presenter sits in `bank-account/shared/` only by historical accident (first writer wins). F26 currently permits the cross-feature primitive import. When a third consumer appears, promote `formatBankError` to a location that reflects shared BC ownership — e.g. a `src/features/bank/shared/presenter.ts` feature-level surface, or an explicit re-export shape.

---

## 2026-05-27 — `validate_batch` DTO field leaks anyhow string into the wire

**Found by:** reviewer-backend (`refactor/typed-errors-patient-procedure` @ `602db31`)

**Where:** `src-tauri/src/context/patient/service.rs:140` — inside `PatientService::validate_batch`, the per-candidate SSN-lookup error arm builds `result.error = Some(format!("Database error checking SSN: {}", e))`, where `e` is the `anyhow::Error` returned by the repository.

**Observation:** The `PatientValidationResult.error` field exposes an untyped `Option<String>` carrying the raw `anyhow::Error` Display output on the batch-validation wire path. PR 1 of the typed-error migration leaves this surface unchanged because changing it requires modifying `PatientValidationResult.error` to a typed shape (struct variant or separate code/message split) — a DTO change that fans into the contract + FE consumers. Naturally folds into PR 3 of the migration, when the repo trait error type itself is reconsidered.

---

## 2026-05-25 — Backend i18n gap: skip-report `reason` strings hardcoded in French

**Found by:** spec-checker (`feat/excel-import-skipped-procedures`)

**Where:** `src-tauri/src/use_cases/excel_import/orchestrator.rs:276–280,303–307,324–328,344–348` — execute-time skip `reason` strings for EXI-280 / EXI-281 / EXI-290 (`"Date d'acte invalide"`, `"Date de paiement confirmée invalide"`, `"La date d'acte … ne correspond pas …"`, `"Nom de feuille inconnu"`). Same pattern in `parser.rs` for EXI-020/220 reasons.

**Observation:** EXI-280 / EXI-290 say the `reason` is "authored on the backend in the user's runtime locale", but no backend i18n infrastructure exists. The orchestrator hardcodes French (the primary locale per `ARCHITECTURE.md`). Secondary en-GB users see French strings. Same pre-existing limitation as EXI-220's parse-time `reason`. Resolving requires either (a) a backend i18n layer reading the runtime locale, or (b) emit stable codes from the backend and translate on the frontend (per F24). Track until the project commits to one of the two; in the meantime EXI-280/290's "runtime locale" wording should be read as "primary locale (fr-FR)".

---

## 2026-05-24 — `Result<T, String>` on use-case Tauri commands violates the wire-error contract

**Found by:** reviewer-backend (`refactor/dates-naive-be`)

**Where:** `src-tauri/src/use_cases/procedure_orchestration/api.rs:104,136,161,199` (`add_procedure`, `read_all_procedures`, `update_procedure`, `delete_procedure`). Same pattern across `src-tauri/src/use_cases/{excel_import,fund_payment_reconciliation}/api.rs`.

**Observation:** Per `docs/error-model.md` § Tauri command boundary, commands should return a typed `{UseCase}Error` composite (`#[serde(untagged)]` wrapping per-BC error enums + a `{UseCase}Task` sub-enum for use-case-specific guards). The current `Result<T, String>` collapses every error into an opaque string on the wire — the FE loses the discriminated-union type for errors and Specta generates `string` instead of the typed error union. Pre-existing across all use-case command surfaces; surfaced by reviewer when `refactor/dates-naive-be` added a new parse-error path inside the already-String-mapped `add_procedure` command.

---

## 2026-05-19 — REF-240 enforced at command layer via dual-orchestrator injection

**Found by:** manual (`refactor/fund-payment-manual-management`)

**Where:** `src-tauri/src/use_cases/fund_payment_manual_management/api.rs:28–53` — the `delete_fund_payment_group` Tauri command injects both `FundPaymentManualManagementOrchestrator` and `OverpaymentOrchestrator`. The REF-240 guard (`ensure_not_refund_fund_payment_group`) is enforced at the command boundary rather than inside the manual delete use case. Lifted verbatim from the pre-refactor `context/fund/api.rs`; surfaced more clearly now that the command lives in its dedicated module.

**Observation:** REF-240 is a domain invariant ("a refund-cascade `FundPaymentGroup` cannot be deleted directly — only via the REF-210 cancellation cascade"), so it must hold for any caller of the manual delete path, not only the Tauri command. Today the check requires a cross-context query (`procedure_refund.refund_fund_payment_group_id`) because the `FundPaymentGroup` row itself carries no marker of what created it; that cross-context need is why the rule sits at the command layer with two `State<>` injections. Two consequences: (a) any future caller bypassing the Tauri command (event handler, CLI, integration test) bypasses the rule; (b) the manual orchestrator depends transitively on the overpayment context for what should be a local invariant.

**Surfaced direction:** Add a `source: GroupSource { Manual, Reconciled, Refund }` column on `FundPaymentGroup`, stamped once at creation by whichever flow writes the row (REF-100 = `Refund`; manual orchestrator = `Manual`; reconciliation orchestrator = `Reconciled`). REF-240 then collapses to `if group.source == Refund { reject }` inside `delete_group_with_cleanup`, and the Tauri command shrinks back to one `State<>`. `procedure_refund.refund_fund_payment_group_id` stays as the cascade key for REF-210 — `source` is the guard projection. Prefer enum over boolean (`is_refund: bool`) because: (a) `Manual` vs `Reconciled` is already an implicit workflow distinction we don't model today, (b) the field is creation-time immutable so an enum models it honestly, (c) booleans don't compose if a fourth origin appears. `source` (or `origin`) over `status` — the value is set once and never mutated.

**Migration constraint:** Backfill must be lossless. The Refund half is exact (JOIN against `procedure_refund.refund_fund_payment_group_id`). The Manual vs Reconciled half cannot be reconstructed from a lossy default because future code paths (UI filters, reports, additional invariants) will rely on the distinction. Migration must identify historical Manual vs Reconciled groups precisely — likely by analyzing reconciliation/import provenance signals already present on related rows (e.g. presence of an excel-import or PDF-reconciliation provenance trail). If no signal exists for some legacy rows, the migration design has to surface them for explicit user/operator classification rather than silently bucket them.

**Scope at fix time:** schema migration (add column + lossless backfill), update `FundPaymentGroup` domain factories (`new`/`with_id`/`restore`) to carry `source`, update REF-100, manual create, and reconciliation create paths to stamp the right value, move REF-240 enforcement into `delete_group_with_cleanup`, drop the second `State<>` from `delete_fund_payment_group`, drop the `OverpaymentOrchestrator` dep wiring from the manual delete path. `reviewer-sql` must run on the migration. REF-220 / REF-230 (status-based local guards on procedure deletion) are unaffected — they already are local and need no changes.

---

## 2026-05-19 — Non-atomic bank-reconciliation writes leave a partial-crash window for `is_locked`

**Where:** `src-tauri/src/use_cases/bank_statement_reconciliation/orchestrator.rs:393–402`, `src-tauri/src/use_cases/bank_manual_match/orchestrator.rs:126,528` — multi-step writes update procedure statuses (tx 1) then group status (tx 2) sequentially, with no enclosing transaction.

**Observation:** A process crash between tx 1 and tx 2 leaves linked procedures `FundPaid`/`PartiallyFundPaid` while the group's stored `FundPaymentGroupStatus` is still `Active`. On next read, `is_locked` returns `false` on the FundPaymentList page until the user re-runs the bank match (or manually transitions the group). Until 2026-05-19 a defensive `recompute_is_locked` in `context/fund/api.rs::read_all_fund_payment_groups` papered over this by re-reading procedures cross-context on every list load — but (a) it violated B13, (b) it never wrote the corrected state back to disk so other commands (`delete_fund_payment_group` etc.) still saw the stored stale status, and (c) the inconsistent window can't actually be observed by clients in normal single-user operation (the user triggered the orchestrator and is waiting for it to return; FE reads only fire after the orchestrator publishes `FundPaymentGroupUpdated`, post-tx-2). The defensive recompute was dropped (`refactor/drop-is-locked-recompute`); the underlying non-atomicity is the real issue and should be fixed when UoW infrastructure lands per ADR-003 (`core/uow.rs`).

---

## 2026-05-16 — RTL coverage gap on currency-display components

**Where:** Components with `formatCurrency` calls but no RTL test:
`SelectProceduresPanel`, `SelectFundGroupsPanel`, `BankTransferList`,
`EditBankTransferModal`, `AddBankTransferForm`, `MatchResultsStep`,
`ProcedureTypeMappingStep`, `EditFundPaymentModal`, `PdfDataTable`,
`NotFoundCard`, `UnreconciledReport`, `GroupMatchCard`.

**Observation:** Surfaced by PR #33's codecov flag (~16 of 18 missing lines on
the currency-i18n sweep). None had RTL tests before the PR — the migration to
`formatCurrency` routed existing display through a different helper, exposing
the pre-existing gap. Functional regression risk is low (mechanical display
swap; the formatter is unit-tested in `src/lib/formatters.test.ts` and the
integration is covered by `SingleMatchCard.test.tsx` AmountMismatch and
`FundPaymentList.test.tsx` locale-aware regressions). Add RTL coverage
**bit-by-bit when these components are next touched for behavioral changes**,
not as a sweep.

---

## 2026-05-13 — `rsa 0.9.10` (Marvin timing side-channel) compiled in via `sqlx-mysql` even though we use SQLite only

**Where:** `Cargo.lock` — `rsa 0.9.10` pulled in by `sqlx-macros → sqlx-mysql 0.8.6`. `Cargo.toml` declares `sqlx = { version = "0.8", features = ["runtime-tokio-rustls", "sqlite"] }` — no `mysql` feature.

**Observation:** [RUSTSEC-2023-0071](https://rustsec.org/advisories/RUSTSEC-2023-0071) flags `rsa <= 0.9.x` as vulnerable to the Marvin attack (RSA key recovery via timing sidechannel). The crate ends up in our compiled binary because `sqlx-macros` resolves dependencies for every sqlx backend at proc-macro time, even features we don't enable at runtime. **No runtime path in this app calls MySQL or invokes `rsa`** — the code is dead in execution. Upstream advisory currently shows _"No fixed upgrade is available!"_; track via `sqlx` ≥ 0.9 (whenever it lands) or a `sqlx-mysql` feature exclusion. Pre-existing — surfaced by the pre-release `cargo audit` run.

---

## 2026-05-13 — `serialize-javascript` RCE/DoS in mocha via `@wdio/mocha-framework` (E2E dev dep only)

**Where:** `package-lock.json` — `@wdio/mocha-framework@9.27.1 → mocha → serialize-javascript ≤ 7.0.4`. Two advisories: [GHSA-5c6j-r48x-rmvq](https://github.com/advisories/GHSA-5c6j-r48x-rmvq) (RCE via `RegExp.flags`) and [GHSA-qj8w-gfj5-8c6v](https://github.com/advisories/GHSA-qj8w-gfj5-8c6v) (DoS via crafted array-likes).

**Observation:** `npm audit fix` cannot reach this without `--force`, which would downgrade `@wdio/mocha-framework` to 6.1.17 (major breaking change in our WebDriver E2E setup). Exposure is dev-only (test runner serialization), not in production. Track until `@wdio/mocha-framework` (or upstream mocha) ships a non-vulnerable `serialize-javascript`.

---

## 2026-06-05 — BE coverage omits dev-fixtures-gated codec integration tests

- Found by: reviewer-infra
- Where: justfile `coverage-be` recipe; `src-tauri/tests/codec_round_trip{,_bank_pdf,_fund_pdf}.rs`
- Context: branch `chore/tarpaulin-integration-coverage` @ `5be9be4`
- Severity: 🔵
- Observation: The three codec round-trip integration tests are gated behind `#![cfg(feature = "dev-fixtures")]`; `just coverage-be` does not pass `--features dev-fixtures`, so tarpaulin compiles them out and they contribute zero coverage even after the `--lib --tests` fix — recovering them additionally requires the dev-fixtures binary fixtures present in the CI environment.
- 2026-06-06 follow-up (PR #59): this is what holds `parser.rs` at ~33% line coverage. The sheet-parsing business logic (13-digit SSN validation, SSN/name patient dedup, EXI-030 invalid-SSN-into-name traceability) is workbook-coupled — it lives inside `workbook.worksheet_range(...)` loops with no pure helper — so it can only be exercised by feeding a built `Xlsx`, and the only xlsx writer (`rust_xlsxwriter`) is itself `dev-fixtures`-gated. The logic IS tested via the round-trip tests; tarpaulin just can't see them. Adding `--features dev-fixtures` to the coverage recipe (and confirming the fixture generation runs under tarpaulin in CI) would surface this honestly. Until then, parser.rs's low number is a measurement artifact, not an untested-logic gap.

---

## 2026-06-06 — Three competing modal primitives with hardcoded z-index

- Found by: manual (issue #60 investigation)
- Where: `src/ui/components/modal/Dialog.tsx` (z-100), `src/ui/components/modal/ModalContainer.tsx` (z-50), `src/features/fund-payment/select_procedure_modal/SelectProcedureModal.tsx` (hand-rolled overlay, z-50)
- Context: branch `fix/60-add-procedure-modal-layering` @ `fe3a400`
- Severity: 🟡
- Observation: The app has three independent modal primitives, each rendering inline in the React tree with its own hardcoded z-index and no shared stacking coordination. A modal opened from inside another (or, in future, route-driven modals) must manually out-number whatever it stacks over, and two modals at the same tier collide by DOM order — hardcoded z-index does not compose. Issue #60 was one instance (child z-50 behind parent z-100), fixed surgically with a z-200 bump. ADR-008 ratifies the resolution: migrate all three primitives onto native `<dialog>` `showModal()` (browser top layer, no z-index). This entry tracks that migration — fold the three primitives into one native-dialog primitive incrementally as features are touched, deleting each interim hardcoded z-index (incl. the #60 z-200) on the way.

---

## 2026-06-06 — Bank credit reconciliation can't handle composite credit lines

- Found by: manual (issue #62)
- Where: `src-tauri/src/use_cases/bank_statement_reconciliation/orchestrator.rs` (exact-amount match, ~L302); domain model (no "aid"/bonus payment concept)
- Severity: 🟡
- Observation: Bank-statement reconciliation auto-matches a credit line to a single fund payment group only on exact amount equality (`group.total_amount == line.amount`, ~L302). A real bank credit is often a composite the current 1:1 exact match cannot settle, in two distinct cases:
  - **Multi-group:** one credit equals the sum of _several tracked_ fund groups (e.g. 247 € = 72 € + 175 €, both real groups). Matching is 1:1 only — there is no subset-sum that lets one bank line settle multiple groups whose totals add up to it. The line stays in `unmatched_lines`.
  - **Uncovered amount:** part of the credit corresponds to something the app does not model at all — e.g. 247 € = 72 € fund group + 175 € "aide"/bonus (an assistance transfer with no entity in the domain). Even perfect multi-group matching can't reconcile this: there is no record to match the 175 € against.
- Note: validating a tracked group via manual match is always safe — it mints its own FundWire transfer sized to the group and never touches the bank statement line, so there is NO data-integrity risk and the bank payment is not "broken". The gap is purely reconciliation _coverage_, not correctness. Resolution direction differs per case: multi-group needs subset/multi-group matching (one bank line → N groups); uncovered-amount needs either a modeled "aid payment" entity that becomes a matchable line item, OR a manual "remainder" annotation recording the untracked portion. Until then, composite credit lines remain unmatched and require manual bookkeeping outside the app.

---

## 2026-06-07 — Migrations ran with foreign keys enforced, and were only tested against childless databases

**Found by:** manual (issue #67 — 0.18.0 startup crash)

**Where:** `src-tauri/src/shared/infrastructure/db.rs` (migration runner) + CI fixtures.

**Observation:** `20260524_billed_amount_not_null.sql` rebuilds `procedure` (a _parent_ table, referenced by `fund_payment_line`) via DROP + CREATE + RENAME. Migrations ran on a connection with `foreign_keys = ON`, and `defer_foreign_keys = ON` does NOT cover dropping a parent: `DROP TABLE procedure` increments SQLite's deferred-violation counter once per child row and recreating the table never clears it, so COMMIT fails (code 787) even though the data is perfectly consistent. Confirmed against a real affected DB: `PRAGMA foreign_key_check` returned **zero** violations, yet COMMIT still failed — the failure is the counter, not an orphan. The original "legacy FK orphan" diagnosis was wrong. Every DB with at least one reconciled payment (a `fund_payment_line` row) crashed on startup; CI passed because test/fresh DBs have no child rows referencing `procedure`, so there is no child to trip the counter.

**Fixed (runner policy, not a one-off):** migrations now run on a dedicated connection with `foreign_keys = OFF` — SQLite's documented table-rebuild recipe. The pragma is a no-op inside sqlx's per-migration transaction (verified empirically), so it must be set on the connection, not in the `.sql`. A `PRAGMA foreign_key_check` runs afterward (non-fatal) as a standing integrity net for genuinely-dirty data (e.g. imports). Each migration still runs in its own transaction, so rollback safety is kept. This future-proofs every later parent-table rebuild.

**Prevention still owed — adversarial migration fixtures.** CI only ever runs migrations against clean/childless data, which is exactly why this shipped. Seed representative messy/edge shapes at a frozen past schema version (parent rows WITH children for #67; later: a NOT-NULL column's NULL row; a UNIQUE index's duplicate), then run migrations forward and assert success + a clean `PRAGMA foreign_key_check`. The new `parent_rebuild_*` tests in `db.rs` are the prototype — generalize into a standing per-migration suite, gated in CI on any `migrations/` change.
