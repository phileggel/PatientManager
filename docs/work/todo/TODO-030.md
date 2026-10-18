# TODO-030 — Saving a paid or reconciled procedure resets its status

Found by `spec-checker` on `docs/spec/procedure-orchestration.md`, release sweep of the batch of 2026-10-18; fixed before that batch's release (owner, 2026-10-18, § 3's user-risk case). Read in the code: the screen sends back `payment_status` as it read it, in the wire spelling (`RECONCILED`, `FUND_PAID`, …); `RawProcedure::into_procedure` (`use_cases/procedure_orchestration/api.rs`) parses it with `ProcedureStatus::from_str`, which knows only the database spelling (`RECONCILIATED`, `…_PAYED`), and falls back to `None`. Since 8246f91 (2026-04-28).

**Size:** S

**User value:** changing the type of a paid or reconciled procedure, or editing an imported paid one, keeps its status: it stays paid and protected from deletion.

**Done when:** `update_procedure` keeps each of the six statuses whose wire and database spellings differ (Reconciled, FundPaid, PartiallyFundPaid, DirectlyPaid, ImportDirectlyPaid, ImportFundPaid) — a Rust test per status sending the wire string; an edit changing nothing on such a procedure answers `Unchanged` (PRO-255); the tests that fed the database spelling to the command send the wire one.

**Design:** none

**Open questions:** none
