# 2026-10-10 — DEBT-048 — The PDF report can still follow a link, and the export builds its `VACUUM INTO` by hand

**Found by:** reviewer-security, release sweep of 0.24.1 (two 🔵 carried over from DEBT-044, whose 🟡 is fixed)

**Where:** `src-tauri/src/use_cases/fund_payment_report_pdf/api.rs` (`export_and_open_fund_reconciliation_report_pdf`, `next_available_path`), `src-tauri/src/use_cases/db_backup/orchestrator.rs` (`do_export`)

**Observation:** the PDF report is written to the Downloads folder under the first name that does not exist; a dangling symbolic link at that name does not "exist", so the write would follow it. `secure_path` now refuses a link at a new file's name (`SymlinkAtDestination`); this command does not go through it. Separately, `VACUUM INTO` is built with `format!` from an internal path — a quote in it is already refused — where a bound parameter would do. Both low risk: the first needs a link planted in Downloads, the second has no outside input.

**Size:** M

**Waits on the owner:** no

**Refined (2026-10-17, before queuing):** `next_available_path` is in `fund_payment_report_pdf/orchestrator.rs:56`; `do_export` formats `VACUUM INTO '{temp_str}'` (`db_backup/orchestrator.rs:64`). Done when: the PDF's destination goes through `secure_path` and a dangling link at the chosen name is refused (a test plants one); `VACUUM INTO` takes a bound parameter and the export test still passes. Ships with DEBT-061 and DEBT-065's slice. Size M holds for the bundle.
