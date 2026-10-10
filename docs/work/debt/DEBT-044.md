# 2026-10-06 — DEBT-044 — Exporting the database follows a symbolic link at the destination

**Found by:** reviewer-security, release sweep of 0.24.1; deferred by the owner (2026-10-06): low risk, predates the release

**Where:** `src-tauri/src/use_cases/db_backup/orchestrator.rs` (`do_export`), `src-tauri/src/use_cases/db_backup/api.rs`, `src-tauri/src/shared/infrastructure/secure_path.rs`, `src-tauri/src/use_cases/fund_payment_report_pdf/api.rs`

**Observation:** 🟡 the path validator canonicalises only the parent folder of a new file, so `File::create` follows a link already sitting at the chosen name. `generate_diagnostic_report` refuses it (`refuse_symlink`); `export_database` does not. Someone must first have planted the link under the home folder, and the path is confined to it and to a `.gz` name. Fix: the same refusal in `secure_path`, shared by both commands, with a test. Two 🔵 of the same sweep: the PDF report written to Downloads has the same gap; `VACUUM INTO` is built with `format!` from an internal path (a quote is rejected) where a bound parameter would do.
