# 2026-10-18 — DEBT-075 — The refund form shows a raw tooltip key and judges dates and lengths unlike the backend

**Found by:** `spec-checker` on `docs/spec/overpayment.md`, release sweep of the batch of 2026-10-18; each point confirmed in the code, all present at v0.24.8

**Where:** `src/features/procedure/ui/procedure_form_modal/ProcedureFormModal.tsx:367`; `src/features/overpayment/record_overpayment_modal/useRecordOverpaymentModal.ts:44,56,88`; `src-tauri/src/use_cases/overpayment/orchestrator.rs:90,103`

**Observation:**

- REF-070: the disabled Refund button's tooltip calls `tov("noAccountTooltip")`; the key is `no_account_tooltip`, so the user reads the raw key.
- REF-070: with several bank accounts the form pre-fills none; the spec pre-fills the source payment's account (only a single account is pre-filled).
- REF-030: the form takes "today" in UTC (`toISOString`), the backend in local time: near local midnight the default date is yesterday's and a refund dated today is refused as future.
- REF-040: the form counts characters, the backend bytes (`reason.len()`): a 200-character French reason passes the form, then is refused.

The date and length points are the form judging its own fields: they go once the form is moved under F30 (TODO-029), where the backend alone judges.

**Size:** S

**Waits on the owner:** no
