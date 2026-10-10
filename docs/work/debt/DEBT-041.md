# 2026-10-06 — DEBT-041 — The screens convert euros to thousandths, in about ten places

**Found by:** the agent, during TODO-016's procedure type audit; kept on screen by the owner's decision (2026-10-06)

**Where:** `src/features/procedure-type/shared/presenter.ts` (`toDefaultAmount`, `toFormData`), `src/features/procedure/ui/procedure_form_modal/useProcedureFormModal.ts`, `src/features/procedure/ui/ProcedurePage.tsx`, `src/features/procedure/ui/procedure_list/ProcedureList.tsx`, `src/features/procedure/shared/presenter.ts`, `src/features/procedure/model/procedure-row.mapper.ts`, `src/features/excel-import/presentation/components/CreateProcedureTypeModal.tsx`, `src/features/excel-import/presentation/components/ProcedureTypeMappingStep.tsx`, `src/features/fund-payment-match/reconciliation_results/cards/GroupMatchCard.tsx`

**Observation:** each site multiplies or divides by 1000 and rounds on its own (`Math.round(x * 1000)`, `x / 1000`); the procedure rows carry amounts in euros as floating-point numbers and convert back on save. Reading what a user typed is input handling and stays on screen, but the rounding rule exists once per site, and a second caller (the CLI of TODO-013) would write it again. Options when it is taken up: one shared frontend helper for the conversion; or commands that take the typed text and let Rust parse and round it.
