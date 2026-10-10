# 2026-10-03 — DEBT-023 — Two use cases import another use case

**Found by:** reviewer-arch (CI run on PR #164, branch `refactor/todo-017-unit-of-work`)

**Where:** `src-tauri/src/use_cases/excel_import/orchestrator.rs` (imports `procedure_orchestration::ProcedureOrchestrationService`), `src-tauri/src/use_cases/fund_payment_manual_management/api.rs` (injects `overpayment::OverpaymentOrchestrator`; see DEBT-003)

**Observation:** B18 forbids a use case importing another use case. These two imports predate the check and were read as a precedent during TODO-017's local review, which let the same violation through until CI caught it. `just arch-check` tests B18 and freezes the two in `arch-allowlist.json` (`use_case_imports`, owner's decision of 2026-10-04 on FLOW-003), where the counts may only shrink.
