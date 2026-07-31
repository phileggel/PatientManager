# TODO

---

## (backend/bank) — Auto-match window 7 → 15 days

`orchestrator.rs:23` `MAX_DATE_OFFSET_DAYS = 7` is too tight for real fund delays (field report 2026-07-30). Per amended BAS-051: 15 days for auto-match; boundary test moves to D+15/D+16.

---

## (frontend/bank) — "Fund unknown" and "transaction missing" look alike in the list

Field report 2026-07-30: raw bank labels render like resolved fund names and all attention badges share one tone. Fix: muted italic style for unlinked raw labels in the fund column; distinct badge tone for À associer (NeedsLink) vs the transaction-missing states — `ReconciliationList.tsx` + `lineStatusTone`.

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

## (domain/procedure) — Review `ProcedureStatus`: de-conflate workflow status and payment/result status

`ProcedureStatus` has grown into a denormalized cross-product of two distinct axes baked into one column: the **workflow stage** (`Created` → `Reconciled` → bank-confirmed) and the **payment/result outcome** (full vs partial, fund vs direct, overpaid/refunded). That is why variants like `PartiallyReconciled` / `PartiallyFundPayed` exist — each is `(stage × result)`. The set is now 11 variants and growing, and every new payment situation added as a flat variant forces all `payment_status` queries + match sites to treat near-synonyms alike (e.g. "eligible for reconciliation" = `Created` and anything that behaves like it). The PRO-310 **Overdue** concept was deliberately kept _derived_ (frontend-only, not a 12th variant) precisely to avoid feeding this conflation — but the underlying tension remains. Genuinely review whether the two axes should be normalized into separate fields (a workflow-stage status + an orthogonal payment-result / annotation), or whether the flat enum stays and is simply documented as such. This is an architectural call (likely an ADR), done deliberately — **not** a sweep and not a side-effect of a feature. Surfaced during the procedure-overdue work (2026-06-21).

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

## (frontend/bank) — Standalone bank label-mapping review surface

Saved `BankFundLabelMapping` records (bank label → fund, per ADR-001) are today **only** editable inside the bank-statement import flow — there is no standalone management surface (the `ManagementModal` covers patients, funds, procedure types, bank accounts, fund payments, but not label mappings; no list/delete command is exposed). Surfaced during the bank-reconciliation draft-UX rework (`feat/bank-reconciliation-draft-ux`), where the in-flow mapping step folds into the unified list — in-flow revision is preserved, but there's still no way to proactively review/fix a wrong mapping without re-importing. Add a `ManagementModal` "Bank label mappings" section: list saved mappings per account, edit the fund (or rejected) assignment, delete a mapping. Backend repo already supports listing (`label_mapping_repo` "find all active mappings"); needs list + delete commands + UI. Priority: low — convenience, no functional gap (in-flow revision works).
