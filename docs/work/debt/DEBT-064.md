# 2026-10-17 — DEBT-064 — The procedure orchestration spec against its code: what the release check of 2026-10-17 found

**Found by:** `spec-checker` on `docs/spec/procedure-orchestration.md`, release preparation of 2026-10-17 (read in the code, not run); PRO-190 and PRO-310 have entries of their own

**Where:** `docs/spec/procedure-orchestration.md`, `docs/contracts/procedure-orchestration-contract.md`, `src/features/procedure/`, `src/ui/components/field/ComboboxField.tsx`, `src-tauri/src/use_cases/procedure_orchestration/service.rs`

**Observation:** 23 of 33 rules fully implemented, 25 tested. Partial in code: PRO-090 (the two partial statuses fall to the neutral badge), PRO-040 (no double-click on a row), PRO-150/160 (no neutral "no result" message), PRO-120 (the per-field messages cannot be reached: Submit is disabled first — the owner's call between the two). Spec behind the code: PRO-260's known limitation (DEBT-047), PRO-270 (tracking is now recomputed), PRO-230 (the billed > 0 guard), PRO-060 (the paid-status fallback), the component tree. No test: PRO-010, 090, 100, 110, 150, 160, 180, 240, PRO-200's invalid date, PRO-300's single event, PRO-250's blocking-status update. Contract: error names and `fund_id`'s type drifted, `get_unpaid_procedures_by_fund` claims a `FundNotFound` nothing raises, `delete_procedure_type` and `delete_fund` are missing. Minor: `service.rs:281` logs `name = BACKEND` for `target`; the comment at `service.rs:337` is stale.

**Size:** L

**Waits on the owner:** no — PRO-120: the owner first kept the disabled Submit (2026-10-17), then chose one rule for every form (2026-10-18): Submit always enabled, a click shows the red message under each missing field and sends nothing — PRO-120 as written; the code follows it under TODO-024.
