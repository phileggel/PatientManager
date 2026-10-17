# 2026-10-17 — DEBT-062 — In a procedure's view mode a change of procedure type cannot be saved

**Found by:** `spec-checker` on `docs/spec/procedure-orchestration.md`, release preparation of 2026-10-17 (read in the code, not run)

**Where:** `src/features/procedure/ui/procedure_form_modal/ProcedureFormModal.tsx` (lines ~393-431), `useProcedureFormModal.ts` (view submit path, ~144-174)

**Observation:** PRO-190 lets a user change a procedure's type in view mode. The view mode renders no Save button — only Close, and Refund for a fund-paid procedure — so the change cannot be submitted; the submit path exists and is tested at hook level only. The gap dates from the overpayment feature (727d275). A `fix` a user would notice.

**Size:** S

**Waits on the owner:** no
