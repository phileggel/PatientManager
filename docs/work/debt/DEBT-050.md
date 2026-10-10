# 2026-10-10 — DEBT-050 — Validating a fund statement is not one transaction

**Found by:** the owner's report on 0.24.1 (a validation refused after its corrections were saved, twice), read in `create_multiple_with_auto_corrections`

**Where:** `src-tauri/src/use_cases/fund_payment_reconciliation/orchestrator.rs` (`create_multiple_with_auto_corrections`, `create_multiple_from_candidates`), `src-tauri/src/shared/infrastructure/uow.rs`

**Observation:** the validation saves the corrections (dates, funds, amounts, created procedures and patients), then resolves the funds — creating the unknown ones — then creates the groups, then updates the procedures: four writes, no shared transaction. FPA-075 now rejects before the first write the one refusal met in production (a group whose total is not positive), and the duplicate check already came first. What remains: a failure after the corrections — a fund that cannot be resolved, a database error while the groups are created — still leaves the corrections saved and the groups missing, and a second click saves them again, created procedures included. The method's own comment already asks for one unit of work across these steps; `uow.rs` exists since TODO-017.
