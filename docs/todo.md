# TODO

Owned by the human (`docs/workflow.md` § 2). The agent only sets `Design`, adds open
questions, removes an entry in the PR that ships it, and writes what the human validated
in `/whats-next`.

## Next

<!-- The queue: TODO-NNN / DEBT-NNN / FLOW-NNN references in the order to work them. The agent takes -->
<!-- the first ready one, removes a reference only in the PR that ships its entry, and -->
<!-- stops when the list is empty. It reorders or adds only what the human validated in -->
<!-- /whats-next. A plain list, in order: no numbers, so two pull requests that each -->
<!-- close an entry do not conflict on renumbering. -->

<!-- Exception (owner, 2026-10-04): the flow entries of this queue ship as bundles, one -->
<!-- pull request per bundle, each one story: FLOW-022 to FLOW-023 (the decided rules -->
<!-- written into `docs/workflow.md` and `CLAUDE.md`); FLOW-005 to FLOW-007 (the tools -->
<!-- nobody used are removed); FLOW-011 with FLOW-018 (the release path). Every other -->
<!-- entry ships alone. -->

- FLOW-025
- DEBT-028
- DEBT-027
- TODO-016
- TODO-013
- FLOW-020
- TODO-008
- TODO-005
- TODO-004
- TODO-018
- DEBT-011
- TODO-019
- DEBT-003
- TODO-020
- TODO-021

---

## TODO-004 — (backend/procedure) — Review procedure projections and read models

`UnreconciledProcedure` is a domain projection introduced when moving `ProcedureRepository` to the domain layer. It sits alongside `Procedure` (the aggregate root) and other procedure-related structures. Before adding more projections, review whether these are genuinely distinct domain concepts or whether `Procedure` should be enriched to cover these cases. Key question: is `UnreconciledProcedure` a real ubiquitous-language concept, or just a query convenience that should be folded into `Procedure` with a different fetch strategy?

**User value:** none directly — a decision on whether `UnreconciledProcedure` is a real domain concept, so later features stop adding projections case by case.

**Done when:** an ADR records whether `UnreconciledProcedure` stays a projection or folds into `Procedure`, with the rule for adding any future projection; if it folds, the code changes in the same PR; `docs/ubiquitous-language.md` follows the decision.

**Design:** none

**Open questions:** none

---

## TODO-005 — (domain/procedure) — Review `ProcedureStatus`: de-conflate workflow status and payment/result status

`ProcedureStatus` has grown into a denormalized cross-product of two distinct axes baked into one column: the **workflow stage** (`Created` → `Reconciled` → bank-confirmed) and the **payment/result outcome** (full vs partial, fund vs direct, overpaid/refunded). That is why variants like `PartiallyReconciled` / `PartiallyFundPayed` exist — each is `(stage × result)`. The set is now 11 variants and growing, and every new payment situation added as a flat variant forces all `payment_status` queries + match sites to treat near-synonyms alike (e.g. "eligible for reconciliation" = `Created` and anything that behaves like it). The PRO-310 **Overdue** concept was deliberately kept _derived_ (frontend-only, not a 12th variant) precisely to avoid feeding this conflation — but the underlying tension remains. Genuinely review whether the two axes should be normalized into separate fields (a workflow-stage status + an orthogonal payment-result / annotation), or whether the flat enum stays and is simply documented as such. This is an architectural call (likely an ADR), done deliberately — **not** a sweep and not a side-effect of a feature. Surfaced during the procedure-overdue work (2026-06-21).

**User value:** none directly — a recorded decision on splitting workflow stage from payment result, so a new payment situation no longer means a new status touching every query.

**Done when:** an ADR decides between two fields (workflow stage and payment result) and the flat enum, and documents each of the 11 variants as a stage and a result. If the split is chosen, the migration becomes its own entry.

**Design:** none

**Open questions:** none

---

## TODO-018 — (backend) — `Procedure` changes go through aggregate methods

Second entry split from TODO-006. Orchestrators mutate the fields of `Procedure` directly; the transitions belong on the aggregate root: `reconcile()`, `unreconcile()`, `dispute()`, `record_payment()`, `revert_payment()`, `clear_payment()`, `correct_billed_amount()`, `correct_fund()`, `correct_date()`.

**User value:** none directly — each rule of a procedure's lifecycle lives in one place and is tested there.

**Done when:** each transition above is a method on `Procedure` with its own Rust tests, including the refused transitions; no orchestrator assigns a `Procedure` status or payment field directly; behaviour is unchanged, the existing tests pass untouched.

**Design:** none

**Open questions:** none

---

## TODO-019 — (backend) — `Patient` and `FundPaymentGroup` changes go through aggregate methods

Third entry split from TODO-006. Same move as TODO-018 for the two smaller aggregates: `Patient::correct_ssn()`, and `confirm_bank_payment()`, `revert_bank_payment()`, `update()` on `FundPaymentGroup`.

**User value:** none directly — the rules of these two aggregates live in one place and are tested there.

**Done when:** each method above exists with its own Rust tests; no orchestrator assigns those fields directly; behaviour is unchanged, the existing tests pass untouched.

**Design:** none

**Open questions:** none

---

## TODO-020 — (backend) — `FundPayment` aggregate root above the groups

Fourth entry split from TODO-006. `FundPaymentGroup` is treated as the top-level object; the monthly document that holds all the groups, `FundPayment`, has no aggregate of its own.

**User value:** none directly — the fund payment document becomes a named concept the code and the specs share.

**Done when:** an ADR records the `FundPayment` aggregate and what it owns; the aggregate exists and the groups are reached through it; `docs/ubiquitous-language.md` carries the term; behaviour is unchanged. Comes after TODO-019.

**Design:** none

**Open questions:** none

---

## TODO-021 — (backend) — Every bounded context follows the B0 folder layout

Last entry split from TODO-006: it moves every file the four others edit, so it comes after them. The target is rule B0 in `docs/backend-rules.md` (`application/`, `domain/`, `infrastructure/` inside each context): `bank` follows it today; `fund`, `patient` and `procedure` do not.

**User value:** none directly — every bounded context is laid out the same way, so code is found where the rule says.

**Done when:** `fund`, `patient` and `procedure` follow B0 as `bank` does; `just arch-check` checks the layout; `ARCHITECTURE.md` matches; no behaviour changes — moves and import paths only. Comes after TODO-017 to TODO-020.

**Design:** none

**Open questions:** none

---

## TODO-008 — (frontend/fund-payment-match) — Create multiple procedures during auto-correction

Currently, the auto-correction flow only allows creating a single procedure. It should support creating multiple procedures in the same operation.

**User value:** the user creates every missing procedure of a fund payment line in one correction, not just one.

**Done when:** in the correction of a fund payment line with no matching procedure, the user can add several procedures, each with its date and amount; the correction is accepted only when the amounts add up to the line's amount; every created procedure joins the fund payment group and ends `Reconciliated` after confirmation, as FPA-250 does for one. The spec and the contract carry the rule; Rust tests cover the sum check and the creation, one E2E the flow.

**Design:** none

**Open questions:** none

---

## TODO-010 — (backend/arch) — Introduce a DI container for orchestrator wiring

Production orchestrators are currently wired manually in `lib.rs` via explicit `Arc<dyn Trait>` constructor injection. This works but doesn't scale well as the number of dependencies grows: adding a dep means touching `lib.rs`, the orchestrator `new()`, and every integration test `Ctx`. A DI container (e.g. `shaku`) would centralize registration and resolve dependencies automatically, reducing wiring boilerplate and making the `new()` signature irrelevant to callers. Evaluate once the orchestrator count or dep count becomes a maintenance burden.

**User value:** none directly — adding a dependency to an orchestrator touches one place instead of three.

**Done when:** every orchestrator is registered in a container; `lib.rs` no longer builds them by hand; integration tests build their context from the same container; adding a dependency touches the orchestrator and its registration only.

**Design:** none

**Open questions:**

- [ ] Not started until wiring a dependency actually hurts — the owner says when.

---

## TODO-013 — (backend) — Headless surface API

A way to drive PatientManager's use cases without the window: the same Rust commands the UI calls, reachable from outside the UI.

**User value:** an agent (e.g. Claude) or another tool can read and act on the practice's data on this machine, through the same rules the app follows.

**Done when:** a `patientmanager` command-line program and an MCP server (a thin layer over the same commands) expose the use cases the UI offers, read and write. Local only: stdio, no network listener. Every write needs an explicit confirmation (`--yes` on the CLI, a confirm step in MCP). Every call is written to an audit log (command, time, record ids — no patient data). A caller must present a credential created and revocable in the app (OS-keychain key or certificate, decided in the spec). Starts with `/spec-writer`; comes after TODO-016. Accepted by the owner: data an agent reads (names, SSNs) is sent to the model provider as conversation content.

**Design:** none

**Open questions:** none

---

## TODO-016 — (frontend+backend) — All logic in Rust

Business rules, validations, aggregations and derivations still live in the frontend in places (sorting and filtering helpers, presenters that compute, hooks that decide). A second surface (TODO-013's CLI and MCP server) must follow the same rules as the app, so the rules must live where both can reach them: in Rust.

**User value:** none directly — the app behaves the same; every rule has one implementation, which the CLI and MCP server reuse.

**Done when:** every business rule, validation, aggregation and derivation in `src/` moves behind a Rust command; the frontend only renders, holds ephemeral UI state and maps error codes to i18n; the tests of that logic move to Rust; a new architecture rule freezes today's frontend logic in `arch-allowlist.json` and may only shrink; "logic in Rust, the frontend renders" joins `docs/workflow.md` § 6; the application core builds without the desktop shell (no Tauri dependency), checked in CI, so TODO-013's CLI and MCP server can link it — as folioneer did in `e4dca5a`. Split per feature, one PR each, with an audit table (moved / kept as display-only) in each PR body.

**Design:** none

**Open questions:** none

---
