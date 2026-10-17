# TODO-018 — (backend) — `Procedure` changes go through aggregate methods

Second entry split from TODO-006. Orchestrators mutate the fields of `Procedure` directly; the transitions belong on the aggregate root: `reconcile()`, `unreconcile()`, `dispute()`, `record_payment()`, `revert_payment()`, `clear_payment()`, `correct_billed_amount()`, `correct_fund()`, `correct_date()`.

**Size:** L — nine transitions, two or three pull requests.

**User value:** none directly — each rule of a procedure's lifecycle lives in one place and is tested there.

**Done when:** each transition above is a method on `Procedure` with its own Rust tests, including the refused transitions; no orchestrator assigns a `Procedure` status or payment field directly; behaviour is unchanged, the existing tests pass untouched. Refined (2026-10-17): about 26 direct assignments read in the use cases — `fund_payment_reconciliation/orchestrator.rs` (8), `fund_payment_manual_management/orchestrator.rs` (8), `bank_manual_match/orchestrator.rs` (4), `bank_statement_reconciliation/` (4), the units of work (2); the aggregate has `with_payment_info`, `clear_payment_info`, `revert_fund_payment` already. Two pull requests: the fund-payment use cases, then the bank ones with the three `correct_*`. Size L holds.

**Design:** none

**Open questions:** none
