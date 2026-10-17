# 2026-10-17 — DEBT-062 — In a procedure's view mode a change of procedure type cannot be saved

**Found by:** `spec-checker` on `docs/spec/procedure-orchestration.md`, release preparation of 2026-10-17 (read in the code, not run)

**Where:** `src/features/procedure/ui/procedure_form_modal/ProcedureFormModal.tsx` (lines ~393-431), `useProcedureFormModal.ts` (view submit path, ~144-174)

**Observation:** PRO-190 lets a user change a procedure's type in view mode. The view mode renders no Save button — only Close, and Refund for a fund-paid procedure — so the change cannot be submitted; the submit path exists and is tested at hook level only. The gap dates from the overpayment feature (727d275). A `fix` a user would notice.

**Size:** S

**Waits on the owner:** no

**Refined (2026-10-17, before queuing):** `ProcedureFormModal.tsx:107` counts `view` as read-only, and the Save buttons at 393-431 render for create, edit and overpaid only; the view submit path (`useProcedureFormModal.ts:144`) sends the type change alone. Done when: in view mode a Save button, as the overpaid mode's (disabled without a type or while saving), submits the type change; success closes the modal with a snackbar, an error keeps it open (PRO-190); a Vitest test renders view mode, changes the type, clicks Save and sees `updateProcedure` called; screenshots. Design: one mock first (an added button, § 4). A `fix`. Size S holds.

**Design:** validated (owner, 2026-10-17): `screenshots/design/DEBT-062-*.png`. Added: an Update button at the right of the view's footer, as the edit and overpaid modes have; on a fund-paid procedure it reads Close · Refund · Update, both primary. Nothing moves or is removed; the fields stay read-only except the type; while saving the button shows its loader.
