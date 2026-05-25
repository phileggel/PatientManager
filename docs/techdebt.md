# Tech Debt

Observations of code smells, inconsistencies, and brittle patterns. Not commitments — tech-debt entries describe _what's odd_, not _what to do_. For action items see `docs/todo.md`.

`whats-next` reads from this file; entries surface as work candidates labelled with their date.

---

<!-- entries removed when resolved; this file is otherwise the running observation log -->

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
