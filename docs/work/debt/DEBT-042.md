# 2026-10-06 — DEBT-042 — Deleting a procedure type or a fund does not clear the patients' defaults (PRO-280, PRO-290)

**Found by:** contract-reviewer (branch `refactor/todo-016-procedure-type-validator`)

**Where:** `src-tauri/src/use_cases/procedure_orchestration/service.rs` (`clear_procedure_type_tracking`, `clear_fund_tracking`), `src-tauri/src/context/procedure/service.rs` (`delete_procedure_type`), `src-tauri/src/context/fund/service.rs` (`delete_fund`), `docs/spec/procedure-orchestration.md`

**Observation:** PRO-280 and PRO-290 say a deleted procedure type or fund is cleared from every patient's latest-procedure defaults. The two functions that do it exist and are tested, but no command calls them: `delete_procedure_type` and `delete_fund` only soft-delete. A patient therefore keeps a default pointing at a deleted type or fund, which the procedure form then offers. The two contracts claimed the side effect; they now say it does not happen. Owner's choice: route both deletions through the `procedure_orchestration` use case so the rules hold, or withdraw the two rules from the spec.
