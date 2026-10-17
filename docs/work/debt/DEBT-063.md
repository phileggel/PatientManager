# 2026-10-17 — DEBT-063 — The overdue tint is lost after the procedure list reloads

**Found by:** `spec-checker` on `docs/spec/procedure-orchestration.md`, release preparation of 2026-10-17 (read in the code, not run)

**Where:** `src/features/procedure/ui/ProcedurePage.tsx` (`reloadRows`, ~128-139), `src/features/procedure/model/useProcedureData.ts` (~51), `src/features/procedure/model/overdue.logic.ts`

**Observation:** PRO-310 tints an overdue procedure. `markOverdueRows` runs on the first load only; `reloadRows` maps the rows without it, so after any add, update, delete or `procedure_updated` event no row is overdue until the page is opened again. The logic is tested, the reload path is not. A `fix` a user would notice.

**Size:** S

**Waits on the owner:** no
