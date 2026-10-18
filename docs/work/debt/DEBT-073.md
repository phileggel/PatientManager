# 2026-10-18 — DEBT-073 — The procedure form's hook translates the backend's refusals itself

**Found by:** CI `reviewer-frontend` on TODO-008's PR #333, which flagged the same pattern in `useSplitEditor` (fixed there); the procedure form merged with it under TODO-026 (PR #330) while its CI lane passed

**Where:** `src/features/procedure/ui/procedure_form_modal/useProcedureFormModal.ts` (`showRefusal`, `handlePatientCreated`)

**Observation:** the hook calls `t()` on the presenter's keys and keeps translated strings as `fieldErrors`; F27 has the hook keep the typed error or its keys and the component translate. Same fix as `useSplitEditor`: keep the keys, call `t()` where each message renders in `ProcedureFormModal.tsx` and `CreatePatientForm.tsx`.

**Size:** S

**Waits on the owner:** no
