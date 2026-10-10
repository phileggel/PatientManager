# 2026-10-05 — DEBT-035 — An SSN that is not 13 digits in the patient sheet may fail the whole import

**Found by:** spec-checker (branch `fix/debt-031-block-month-on-every-blocking-status`; read in the code, not run)

**Where:** `src-tauri/src/use_cases/excel_import/parser.rs` (the patient-sheet path), `src-tauri/src/use_cases/excel_import/orchestrator.rs`, `docs/spec/excel-import.md` (EXI-030)

**Observation:** EXI-030's 13-digit check and its fallback name exist only where a patient is derived from a monthly sheet. A row of the patient sheet keeps its SSN as written; the orchestrator passes it to the patient batch creation, whose validation rejects it, and the error propagates as a failed import. To confirm with a test before fixing. A `fix`.
