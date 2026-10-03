# TODO

Owned by the human (`docs/workflow.md` § 2). The agent only sets `Design`, adds open
questions, removes an entry in the PR that ships it, and writes what the human validated
in `/whats-next`.

## Next

<!-- The queue: TODO-NNN / DEBT-NNN references in the order to work them. The agent takes -->
<!-- the first ready one, removes a reference only in the PR that ships its entry, and -->
<!-- stops when the list is empty. It reorders or adds only what the human validated in -->
<!-- /whats-next. -->

1. TODO-016
2. TODO-013

---

## TODO-001 — (ci) — Windows E2E at the release gate

Linux E2E (CI via `.github/workflows/e2e.yml`) covers ~95% of regressions but doesn't validate the Windows binary that ships. A proper Windows E2E job gating `release.yml` is the missing release-time safety net.

Scope:

- Make `wdio.conf.ts` platform-aware (Linux WebKitGTK driver vs Windows WebView2/EdgeDriver).
- Add a job (or pre-step) in `release.yml` that builds the MSVC binary, then runs the WDIO suite against it.
- Sequence: E2E gates the Windows bundle/draft-release step — no half-baked artifact on broken code.
- Watch out for Windows runner flakiness; may need retry logic.

Cost: probably half a day of setup + ongoing maintenance burden. Defer until release cadence makes the gap actively painful.

**User value:**

**Done when:**

**Design:** none

**Open questions:** Done when not written yet.

---

## TODO-002 — (frontend+backend/data-quality) — Patient deduplication assistant

The excel-import dedup rule (EXI-080) is intentionally permissive: an empty-SSN row reuses a same-name DB patient (SSN-bearing first, blank-SSN otherwise) to avoid stacking duplicates on re-imports. Two real-world risks remain: (a) two genuinely different patients sharing the same name will be merged the first time, and (b) when SSN is added manually to an existing patient between two imports, a future blank-SSN row still merges instead of staying separate. A UI assistant should surface candidate duplicates (same name, overlapping procedure history, etc.), let the user confirm pair-by-pair, and merge — preserving procedure attachments under the surviving patient. Priority: low.

**User value:**

**Done when:**

**Design:** none

**Open questions:** Done when not written yet.

---

## TODO-004 — (backend/procedure) — Review procedure projections and read models

`UnreconciledProcedure` is a domain projection introduced when moving `ProcedureRepository` to the domain layer. It sits alongside `Procedure` (the aggregate root) and other procedure-related structures. Before adding more projections, review whether these are genuinely distinct domain concepts or whether `Procedure` should be enriched to cover these cases. Key question: is `UnreconciledProcedure` a real ubiquitous-language concept, or just a query convenience that should be folded into `Procedure` with a different fetch strategy?

**User value:**

**Done when:**

**Design:** none

**Open questions:** Done when not written yet.

---

## TODO-005 — (domain/procedure) — Review `ProcedureStatus`: de-conflate workflow status and payment/result status

`ProcedureStatus` has grown into a denormalized cross-product of two distinct axes baked into one column: the **workflow stage** (`Created` → `Reconciled` → bank-confirmed) and the **payment/result outcome** (full vs partial, fund vs direct, overpaid/refunded). That is why variants like `PartiallyReconciled` / `PartiallyFundPayed` exist — each is `(stage × result)`. The set is now 11 variants and growing, and every new payment situation added as a flat variant forces all `payment_status` queries + match sites to treat near-synonyms alike (e.g. "eligible for reconciliation" = `Created` and anything that behaves like it). The PRO-310 **Overdue** concept was deliberately kept _derived_ (frontend-only, not a 12th variant) precisely to avoid feeding this conflation — but the underlying tension remains. Genuinely review whether the two axes should be normalized into separate fields (a workflow-stage status + an orthogonal payment-result / annotation), or whether the flat enum stays and is simply documented as such. This is an architectural call (likely an ADR), done deliberately — **not** a sweep and not a side-effect of a feature. Surfaced during the procedure-overdue work (2026-06-21).

**User value:**

**Done when:**

**Design:** none

**Open questions:** Done when not written yet.

---

## TODO-006 — DDD Convergence — Major refactors (structural, plan carefully)

- **Folder restructure**: migrate all bounded contexts to per-aggregate sub-folders per B0/B0d (`context/{domain}/{aggregate}/domain.rs`, `repository.rs`, `service.rs`)
- **Extract aggregate root methods on `Procedure`**: `reconcile()`, `unreconcile()`, `dispute()`, `record_payment()`, `revert_payment()`, `clear_payment()`, `correct_billed_amount()`, `correct_fund()`, `correct_date()` — currently all direct field mutations in orchestrators
- **Extract aggregate root methods on `Patient`**: `correct_ssn()`
- **Extract aggregate root methods on `FundPaymentGroup`**: `confirm_bank_payment()`, `revert_bank_payment()`, `update()`
- **Introduce `FundPayment` aggregate root**: currently missing — `FundPaymentGroup` is incorrectly the top-level object; `FundPayment` is the monthly document wrapping all groups
- **Implement UoW pattern**: `core/uow.rs` per ADR-003 — needed for atomic cross-aggregate writes in reconciliation

**User value:**

**Done when:**

**Design:** none

**Open questions:** Done when not written yet.

---

## TODO-007 — (backend/frontend) — Specta: convert domain objects to camelCase at the boundary

Convert domain objects to camelCase when crossing into the frontend.

**User value:**

**Done when:**

**Design:** none

**Open questions:** Done when not written yet.

---

## TODO-008 — (frontend/fund-payment-match) — Create multiple procedures during auto-correction

Currently, the auto-correction flow only allows creating a single procedure. It should support creating multiple procedures in the same operation.

**User value:**

**Done when:**

**Design:** none

**Open questions:** Done when not written yet.

---

## TODO-009 — F10 — Extract logic to dedicated hooks (procedure feature)

Multiple F10 violations in the procedure feature: business logic (state, memos, callbacks) lives directly in component files instead of colocated hook files. Deferred — large architectural refactors with no functional impact.

**User value:**

**Done when:**

**Design:** none

**Open questions:** Done when not written yet.

---

## TODO-010 — (backend/arch) — Introduce a DI container for orchestrator wiring

Production orchestrators are currently wired manually in `lib.rs` via explicit `Arc<dyn Trait>` constructor injection. This works but doesn't scale well as the number of dependencies grows: adding a dep means touching `lib.rs`, the orchestrator `new()`, and every integration test `Ctx`. A DI container (e.g. `shaku`) would centralize registration and resolve dependencies automatically, reducing wiring boilerplate and making the `new()` signature irrelevant to callers. Evaluate once the orchestrator count or dep count becomes a maintenance burden.

**User value:**

**Done when:**

**Design:** none

**Open questions:** Done when not written yet.

---

## TODO-011 — (frontend+backend/support) — Secure support diagnostics (Tier 1 report + Tier 2 encrypted bundle)

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

**User value:**

**Done when:**

**Design:** none

**Open questions:** Done when not written yet.

---

## TODO-013 — (backend) — Headless surface API

A way to drive PatientManager's use cases without the window: the same Rust commands the UI calls, reachable from outside the UI.

**User value:** an agent (e.g. Claude) or another tool can read and act on the practice's data on this machine, through the same rules the app follows.

**Done when:** a `patientmanager` command-line program and an MCP server (a thin layer over the same commands) expose the use cases the UI offers, read and write. Local only: stdio, no network listener. Every write needs an explicit confirmation (`--yes` on the CLI, a confirm step in MCP). Every call is written to an audit log (command, time, record ids — no patient data). A caller must present a credential created and revocable in the app (OS-keychain key or certificate, decided in the spec). Starts with `/spec-writer`; comes after TODO-016. Accepted by the owner: data an agent reads (names, SSNs) is sent to the model provider as conversation content.

**Design:** none

**Open questions:** none

---

## TODO-016 — (frontend+backend) — All logic in Rust

Business rules, validations, aggregations and derivations still live in the frontend in places (sorting and filtering helpers, presenters that compute, hooks that decide). A second surface (TODO-013's CLI and MCP server) must follow the same rules as the app, so the rules must live where both can reach them: in Rust. Makes TODO-009 partly obsolete — logic that leaves the frontend needs no hook.

**User value:** none directly — the app behaves the same; every rule has one implementation, which the CLI and MCP server reuse.

**Done when:** every business rule, validation, aggregation and derivation in `src/` moves behind a Rust command; the frontend only renders, holds ephemeral UI state and maps error codes to i18n; the tests of that logic move to Rust; a new architecture rule freezes today's frontend logic in `arch-allowlist.json` and may only shrink; "logic in Rust, the frontend renders" joins `docs/workflow.md` § 6; the application core builds without the desktop shell (no Tauri dependency), checked in CI, so TODO-013's CLI and MCP server can link it — as folioneer did in `e4dca5a`. Split per feature, one PR each, with an audit table (moved / kept as display-only) in each PR body.

**Design:** none

**Open questions:** none

---
