# TODO

---

## (ci) — Windows E2E at the release gate

Linux E2E (CI via `.github/workflows/e2e.yml`) covers ~95% of regressions but doesn't validate the Windows binary that ships. A proper Windows E2E job gating `release-windows.yml` is the missing release-time safety net.

Scope:

- Make `wdio.conf.ts` platform-aware (Linux WebKitGTK driver vs Windows WebView2/EdgeDriver).
- Add a job (or pre-step) in `release-windows.yml` that builds the MSVC binary, then runs the WDIO suite against it.
- Sequence: E2E gates the Windows bundle/draft-release step — no half-baked artifact on broken code.
- Watch out for Windows runner flakiness; may need retry logic.

Cost: probably half a day of setup + ongoing maintenance burden. Defer until release cadence makes the gap actively painful.

---

## (frontend+backend/data-quality) — Patient deduplication assistant

The excel-import dedup rule (EXI-080) is intentionally permissive: an empty-SSN row reuses a same-name DB patient (SSN-bearing first, blank-SSN otherwise) to avoid stacking duplicates on re-imports. Two real-world risks remain: (a) two genuinely different patients sharing the same name will be merged the first time, and (b) when SSN is added manually to an existing patient between two imports, a future blank-SSN row still merges instead of staying separate. A UI assistant should surface candidate duplicates (same name, overlapping procedure history, etc.), let the user confirm pair-by-pair, and merge — preserving procedure attachments under the surviving patient. Priority: low.

---

## (frontend/db-index) — IBAN uniqueness DB constraint follow-up

`bank-account` R5 (IBAN uniqueness across soft-deleted accounts) is enforced at the service layer (`BankAccountService::create_account` + `update_account` + `find_by_iban_including_deleted`). The existing partial unique index `idx_bank_account_iban_active` covers active rows only. Reconsider whether a DB-level CHECK / trigger / non-partial unique index would be preferable once SQLite version is upgraded — would close the (currently negligible) TOCTOU window between the service-layer guard and the INSERT.

---

## (backend/procedure) — Review procedure projections and read models

`UnreconciledProcedure` is a domain projection introduced when moving `ProcedureRepository` to the domain layer. It sits alongside `Procedure` (the aggregate root) and other procedure-related structures. Before adding more projections, review whether these are genuinely distinct domain concepts or whether `Procedure` should be enriched to cover these cases. Key question: is `UnreconciledProcedure` a real ubiquitous-language concept, or just a query convenience that should be folded into `Procedure` with a different fetch strategy?

---

## DDD Convergence — Major refactors (structural, plan carefully)

- **Folder restructure**: migrate all bounded contexts to per-aggregate sub-folders per B0/B0d (`context/{domain}/{aggregate}/domain.rs`, `repository.rs`, `service.rs`)
- **Extract aggregate root methods on `Procedure`**: `reconcile()`, `unreconcile()`, `dispute()`, `record_payment()`, `revert_payment()`, `clear_payment()`, `correct_billed_amount()`, `correct_fund()`, `correct_date()` — currently all direct field mutations in orchestrators
- **Extract aggregate root methods on `Patient`**: `correct_ssn()`
- **Extract aggregate root methods on `FundPaymentGroup`**: `confirm_bank_payment()`, `revert_bank_payment()`, `update()`
- **Introduce `FundPayment` aggregate root**: currently missing — `FundPaymentGroup` is incorrectly the top-level object; `FundPayment` is the monthly document wrapping all groups
- **Implement UoW pattern**: `core/uow.rs` per ADR-003 — needed for atomic cross-aggregate writes in reconciliation

---

## (backend/frontend) — Specta: convert domain objects to camelCase at the boundary

Convert domain objects to camelCase when crossing into the frontend.

---

## (backend/fund) — Tech Debt: fund/patient creation in reconciliation feature

- Currently fund/patient records are created automatically during fund-payment reconciliation.
- Is this expected?
- What's the right solution?

---

## (frontend/fund-payment-match) — Create multiple procedures during auto-correction

Currently, the auto-correction flow only allows creating a single procedure. It should support creating multiple procedures in the same operation.

---

## F10 — Extract logic to dedicated hooks (procedure feature)

Multiple F10 violations in the procedure feature: business logic (state, memos, callbacks) lives directly in component files instead of colocated hook files. Deferred — large architectural refactors with no functional impact.

---

## (backend/arch) — Introduce a DI container for orchestrator wiring

Production orchestrators are currently wired manually in `lib.rs` via explicit `Arc<dyn Trait>` constructor injection. This works but doesn't scale well as the number of dependencies grows: adding a dep means touching `lib.rs`, the orchestrator `new()`, and every integration test `Ctx`. A DI container (e.g. `shaku`) would centralize registration and resolve dependencies automatically, reducing wiring boilerplate and making the `new()` signature irrelevant to callers. Evaluate once the orchestrator count or dep count becomes a maintenance burden.

## (frontend+backend/support) — Secure support diagnostics (Tier 1 report + Tier 2 encrypted bundle)

Streamline how a user sends support data to the maintainer. Today it's a manual file copy (see gh#67, where a real DB had to be hand-copied to diagnose a migration crash). Two tiers; the security lives in the **artifact**, not the channel, so transport can be chosen for fluidity.

**Tier 1 — PII-free diagnostic report (build first).** In-app "Generate diagnostic report" → small text/JSON: app + schema version, applied migrations (`_sqlx_migrations`), `PRAGMA integrity_check` + `PRAGMA foreign_key_check`, per-table row counts, last N PII-scrubbed log lines, a short support code, optional user-entered name/practice. One-click HTTP POST to a maintainer-controlled Cloudflare Worker → stored in D1 keyed by support code (no email, no copy/paste, queryable). Would have diagnosed gh#67 in a single message. Free and card-free (Workers + D1 free tier).

**Tier 2 — client-side-encrypted bundle (later).** "Export support bundle" → logs + a `VACUUM INTO` DB snapshot, zipped, encrypted to the maintainer's embedded **age public key** (`.age`). Only the maintainer's private key decrypts, so the channel can be anything.

⚠️ **Cost/abuse concern — do NOT ship open auto-upload.** An embedded auto-upload-to-R2 endpoint makes other people's data (and the storage bill) the maintainer's liability, and an embedded endpoint invites spam uploads. Mitigations, in order of preference:

1. **Manual file-drop (recommended).** Use an **upload-only "file request" link** — a feature where the maintainer creates, once, a public URL pointing to a folder they own with **upload-only** permission: anyone with the link can add a file but cannot list, view, or download anything already there (so users never see each other's uploads — privacy even for ciphertext). No account needed by the user; files land in the maintainer's storage, which the maintainer controls and deletes → no per-upload pay surprise, no embedded-endpoint abuse surface.
   - **App flow:** generate the `.age` → save it (e.g. Downloads) → open the maintainer's file-drop URL in the browser → instruct the user to drag the saved file onto the page (show the support code). The link is a static URL pasted into app config — no backend, no code.
   - **Tradeoff:** a file-drop link is an interactive browser upload page, not a programmatic API, so the user does one manual drag-drop step. That manual step is the price of zero infrastructure (the only way to make it truly one-click is the gated-R2 option below).
   - **Services with upload-only links:** self-hosted **Nextcloud "File drop"** (full EU/data control — preferred) and **Dropbox "File requests"** are confirmed upload-only; **Infomaniak kDrive** (Swiss) has file-request links (confirm); **Proton Drive** — verify it offers _upload-only_ links specifically; **Google Drive** has no native upload-only public link (skip — a Form forces Google sign-in).
2. **Gated + ephemeral R2.** The Worker issues a presigned PUT URL only after the maintainer approves a support code (no unsolicited uploads), with a hard size cap and an R2 lifecycle rule auto-deleting bundles after ~14 days. Bounded, stays in free tier, but R2 requires a card on file.

**Keys:** age keypair (public embedded in the app, private held by the maintainer); intake access key (embedded — rate-gates the Worker; not truly secret but raises the bar and is rotatable).

**GDPR (health data):** consent prompt before a bundle includes the DB; minimize (Tier 1 by default, Tier 2 only on request); retention / auto-delete; a short privacy note.

Deferred decisions: exact diagnostic field list, log-line count, support-code format, Tier-2 transport (drop-link vs gated R2), retention window. Spec via `/spec-writer` when scheduled.

---

## (frontend/i18n) — Migrate i18n keys to snake_case (i18n-rules §31)

`docs/i18n-rules.md` §31 mandates snake_case for every key segment, but the locale files predate the rule and are uniformly camelCase. Scope audit (2026-06-19, requested before scheduling): this is **project-wide, not fund-payment-match-local** — ~467 camelCase segments across all 14 namespaces under `src/i18n/locales/{en,fr}/`, heaviest in `bank.json` (82), `procedure.json` (49), `fund-payment-match.json` (46), `fund-payment.json` (36), `excel-import.json` (35).

Approach:

- **One `refactor(i18n)` PR per namespace**, each migrating that namespace's JSON keys (en + fr) **and** all its `t()` call sites together. Per-namespace is the natural unit: each namespace is independent, and a full single-namespace migration avoids the within-namespace half-migrated split the original observation warned against. Do NOT do a piecemeal subset of one namespace.
- Sequence smallest-first (`db-backup` 3, `dashboard` 4, `management-modal` 7…) to validate the rename mechanics before the large namespaces.

⚠️ **Hazard — PascalCase keys bound to backend enum variant names.** Some keys mirror Rust enum variants and are looked up via **dynamic interpolation**, so a naive snake_case rename silently breaks them (the interpolated key no longer matches). Known in fund-payment-match: `print.section2.groups.{ContestAmount,CreateProcedure,LinkProcedure,AmountMismatch,FundMismatch,DateMismatch}` resolved via ``t(`print.section2.groups.${type}`)`` in `reportPresenter.ts:211`, where `type` is the wire variant. Audit each namespace for ``t(`...${var}`)`` patterns (`status.${key}`, `sheetSelection.sheets.${sheet}`, etc.) first. For each: either keep the dynamic segment matching the wire variant (i.e. do NOT snake_case enum-keyed segments), or introduce an explicit `variant → snake_case_key` mapping at the call site. This is the design call that makes the rename non-mechanical.

- Mechanical-only segments (static `t("modal.footer.autoCorrect")` → `auto_correct`) are a safe find-replace once the dynamic ones are carved out.
- Lint/test gate: `i18n-rules` review + `just check` per PR; no behavior change, so non-visual exemption applies.

Cost: ~1 focused PR per namespace, ~14 PRs total (or grouped). Priority: low — pure convention alignment, no functional impact. Schedule the hazardous namespaces (fund-payment-match, anything with dynamic enum keys) only after the mechanical ones prove the pattern.
