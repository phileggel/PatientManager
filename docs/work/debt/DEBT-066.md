# 2026-10-17 — DEBT-066 — Release sweep of 2026-10-17: what the code lanes found

**Found by:** `reviewer-backend`, `reviewer-frontend` in `release-sweep` mode, release preparation of 2026-10-17 (0 🔴; `reviewer-arch`, `reviewer-e2e`, `reviewer-sql`: nothing)

**Where:** `src-tauri/src/context/procedure/repository/procedure_type.rs` (`soft_delete_in`, `find_by_name`), `src-tauri/src/context/fund/repository.rs` (`soft_delete_in`), `src/features/excel-import/presentation/components/ProcedureTypeMappingStep.tsx` (per-row `<select>`)

**Observation:** 🔵 three `tracing::trace!` without `target: BACKEND` in code this batch wrote or touched; 🔵 a missing fund payment group still settles as a no-op in `bank_manual_match` (no not-found variant); 🟡 the per-row type `<select>` of the import mapping has no stable id nor a translated label (F24, F25), older than this batch. The 🟡 that a failed read of the saved mappings is not logged does not hold: the gateway logs it.

**Size:** S

**Waits on the owner:** no
