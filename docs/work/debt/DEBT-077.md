# 2026-10-18 — DEBT-077 — The overpayment steps' tests check only that a call succeeds

**Found by:** `spec-checker` on `docs/spec/overpayment.md`, release sweep of the batch of 2026-10-18

**Where:** `src-tauri/src/use_cases/overpayment/orchestrator.rs` (tests); `src-tauri/src/use_cases/procedure_orchestration/service.rs` (REF-170 test); `src/features/procedure/ui/procedure_form_modal/ProcedureFormModal.test.tsx`; `src-tauri/src/use_cases/fund_payment_manual_management/api.rs:42-48`; `src-tauri/src/use_cases/bank_manual_match/orchestrator.rs:412,483`; `src/features/overpayment/cancel_refund_dialog/useCancelRefundDialog.ts:36-40`

**Observation:**

- REF-090, REF-110, REF-120, REF-160, REF-170 and REF-210: the tests assert `Ok`, not what each step wrote (the transfer's fields, the link, the Overpaid status, the refund's new type).
- REF-190: no test renders `mode="overpaid"`, so PRO-121 and PRO-122 are untested there.
- REF-240: the guard in the command is untested; the tested `ensure_not_refund_fund_payment_group` has no production caller (dead code).
- `update_direct_transfer` and `delete_direct_transfer` refuse only `FundWire`, so a refund transfer (`FundOutgoingWire`) can be removed outside REF-210's cancel steps by a direct command call; the screen sends it to `delete_fund_transfer`.
- REF-210: on a failed cancel the dialog stays open; the spec closes it.

**Size:** M

**Waits on the owner:** no
