# 2026-10-03 — DEBT-025 — Four use-case files name sqlx outside a unit of work

**Found by:** reviewer-arch (CI run on PR #166, branch `feat/todo-011-diagnostic-report`)

**Where:** `src-tauri/src/use_cases/db_backup/orchestrator.rs`, `src-tauri/src/use_cases/bank_statement_reconciliation/label_mapping_repo.rs`, `src-tauri/src/use_cases/excel_import/amount_mapping_repo.rs`

**Observation:** B24 forbids sqlx types in a use case outside its `sqlx_uow.rs`. These three predate the check; the two `*_repo.rs` files are whole repositories living in a use case. `just arch-check` tests B24 and freezes them in `arch-allowlist.json` (`sqlx_in_use_cases`, owner's decision of 2026-10-04 on FLOW-003), where the counts may only shrink; `bank_manual_match/orchestrator.rs`, first listed here, names sqlx in its test module only.
