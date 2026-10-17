# 2026-10-17 — DEBT-065 — Release sweep of 2026-10-17: what the security lane found

**Found by:** `reviewer-security` in `release-sweep` mode over the whole command surface, release preparation of 2026-10-17 (0 🔴, 3 🟡, 3 🔵)

**Where:** `src-tauri/src/use_cases/*/api.rs` and `context/*/api.rs` (request payloads), `src-tauri/src/shared/infrastructure/logger.rs` (`log_frontend`) with `src/infra/logger.ts`, `src-tauri/src/use_cases/db_backup/orchestrator.rs` (import, ~150), `src-tauri/src/use_cases/fund_payment_report_pdf/api.rs` (`validate_filename`, `next_available_path`)

**Observation:** none of it new in this release. 🟡 `#[serde(deny_unknown_fields)]` is on one request payload only (`ReportGenerationRequest`); the strict payloads of the other commands accept unknown fields. 🟡 The frontend logger redacts object arguments, not a string message, which reaches the backend log and the diagnostic report; the call sites read log ids and flags only. 🟡 The `VACUUM INTO` built by hand is DEBT-048. 🔵 The `.gz` import copies through `GzDecoder` without a size cap. 🔵 `validate_filename` accepts `:` and Windows reserved names. 🔵 `next_available_path` returns the original path after 1 000 probes.

**Size:** M

**Waits on the owner:** no
