# 2026-10-11 — DEBT-058 — Release sweep of the batch of 2026-10-11: what the backend lane found

**Found by:** `reviewer-backend` in release-sweep mode, on `main` at 3e95603 (the security, architecture, frontend, E2E and migration lanes found nothing that was not already filed)

**Where:** `src-tauri/src/use_cases/fund_payment_reconciliation/` (`orchestrator.rs`, `sqlx_uow.rs`), `src-tauri/src/context/procedure/repository/procedure.rs` and `src-tauri/src/context/patient/repository.rs` (`update_in`, `insert_in`), `src-tauri/src/use_cases/fund_payment_reconciliation/reconciliation/reconciliation_pass.rs`

**Observation:** no 🔴. Three 🟡, the first two from the unit of work of this batch (FPA-076): (1) the row writers `update_in` never check how many rows they changed, so a procedure or a patient deleted between the planning and the transaction is skipped in silence and its group is still committed — the same writers serve the bank units of work, so failing on zero rows is one choice for all; (2) a candidate that names a procedure the database no longer holds is found only when its line is refused by the foreign key, so the user reads "a database error" for a selection that went stale — a count compared while planning, and an error of its own, would say it; (3) seven `#[allow(clippy::too_many_arguments)]` carry no reason, two of them in files this batch touched. Three 🔵: the duplicate check repeated in the two validation paths, `insert_in` of a patient without a `.context`, a `Vec` without its capacity. One point that is not the lane's to settle: a fund created from a label without a number keeps the whole label as its identifier and its name, so on a group where the fund takes money back from one person, that person's name would be stored in the `fund` table. The logs no longer carry it (DEBT-051); what is stored is the question TODO-022 already asks of the parser.

**Size:** M

**Waits on the owner:** no — a fund created from a label that can hold a person's name stays a question of TODO-022 (owner, 2026-10-11)
