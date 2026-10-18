# 2026-10-18 — DEBT-078 — Auto-correct all overrides a contested amount

**Found by:** `spec-checker` on `docs/spec/fund-payment-auto-match.md`, release sweep of the batch of 2026-10-18; confirmed in the code, present at v0.24.8

**Where:** `src/features/fund-payment-match/reconciliation_modal/useReconciliationModal.ts` (`handleAutoCorrectAll`); `src-tauri/src/use_cases/fund_payment_reconciliation/orchestrator.rs` (AmountMismatch and ContestAmount application)

**Observation:**

- FPA-450 against FPA-210: on a line whose amount the user contested, "Auto-correct all" (still shown, the other anomalies being unresolved) also stages `AmountMismatch`, since it checks only the correction's key, not `ContestAmount-{id}`. Both corrections then apply: the billed amount the user disputed is replaced by the PDF's.
- FPA-440: Enter on a not-found card stages a `CreateProcedure`, which the spec does not say; no test covers Enter on the other cards.
- FPA-030: lines after the last total line, lines the heuristic filter drops and lines failing normalisation are not reported, or are counted without a sample.

**Size:** S

**Waits on the owner:** no
