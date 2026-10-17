# 2026-10-12 — DEBT-061 — Release sweep of 2026-10-12: two error texts that can carry a path

**Found by:** `reviewer-security` in `release-sweep` mode, before the release after 0.24.4 (0 🔴, 0 🟡, 2 🔵 over the whole command surface)

**Where:** `src-tauri/src/use_cases/fund_payment_report_pdf/api.rs` (lines 113-117), `src-tauri/src/use_cases/fund_payment_reconciliation/api.rs` (line 126)

**Observation:** `OpenFailed { detail: e.to_string() }` sends the opener's raw error text to the frontend; it can hold the local path of the report, in Downloads, which holds no patient data. `error = %format!("{e:#}")` logs the whole anyhow chain of the PDF extraction, which could echo a file path or a fragment of the file. The sibling errors use a fixed code; the log could carry the error kind instead. The rest of the surface was clean: every path from the frontend goes through `validate_user_path`, the four `AssertSqlSafe` formats carry no user input, no dangerous API in the frontend, no secret in the tree.

**Size:** S

**Waits on the owner:** no

**Refined (2026-10-17, before queuing):** `fund_payment_report_pdf/api.rs:115` and `fund_payment_reconciliation/api.rs:126` read. Done when: `OpenFailed` carries a fixed code without the opener's text; the extraction failure logs the error kind, not the chain; a test on each. Ships with DEBT-048. Size S holds.
