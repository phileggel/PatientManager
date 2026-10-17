# 2026-10-17 — DEBT-069 — Release sweep of the batch after 0.24.7: what the code lanes found

**Found by:** `reviewer-backend`, `reviewer-security`, `reviewer-arch` in `release-sweep` mode, since `v0.24.7` (security: the whole command surface); `reviewer-frontend`, `reviewer-e2e`, `reviewer-sql`: nothing beyond TODO-024

**Where:** `src-tauri/src/use_cases/overpayment/orchestrator.rs` (Step 8), `src-tauri/src/context/fund/domain.rs` (`FundPaymentGroup::refund`), `src-tauri/src/use_cases/fund_payment_report_pdf/api.rs` (`validate_filename`), `src-tauri/src/shared/infrastructure/pdf_extractor.rs` (`fs::read`), `src-tauri/src/use_cases/db_backup/orchestrator.rs` (`VACUUM INTO`)

**Observation:** no 🔴. 🟡 the refund group's build failure maps to `OverpaymentTask::DatabaseError` (inherited; only an empty procedure id, from the row just created). 🔵 `refund` takes any amount (kept so in DEBT-057 to change no behaviour; its refusals belong with TODO-018); a `:` in a report name is refused with the "path separator" message; `extract_pdf_text` reads a user-chosen file whole with no size cap; `db_backup` still names sqlx outside `sqlx_uow.rs` (B24, frozen at 4, not raised).

**Size:** S

**Waits on the owner:** no
