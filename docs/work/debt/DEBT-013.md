# 2026-08-03 — DEBT-013 — Wire counters orphaned by the two-screen split

**Found by:** spec-reviewer (BAS-120–123 amendment pass, branch `feat/bank-wizard-procedures-and-window`)

**Where:** `BankStatementReconciliation.resolved_count` / `needs_correction_count` (`src-tauri/src/use_cases/bank_statement_reconciliation/reconciliation.rs`, contract § Shared Types)

**Observation:** the settlement screen derives its counts frontend-side over visible lines (BAS-122), leaving the wire's whole-document counters without a consumer. Removing them is a wire change deliberately not folded into the comment-only 2026-08-03 contract refresh; fold into the next PR that reshapes this wire surface.
