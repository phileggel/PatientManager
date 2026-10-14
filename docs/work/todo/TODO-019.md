# TODO-019 — (backend) — `Patient` and `FundPaymentGroup` changes go through aggregate methods

Third entry split from TODO-006. Same move as TODO-018 for the two smaller aggregates: `Patient::correct_ssn()`, and `confirm_bank_payment()`, `revert_bank_payment()`, `update()` on `FundPaymentGroup`.

**Size:** M — one pull request, two aggregates.

**User value:** none directly — the rules of these two aggregates live in one place and are tested there.

**Done when:** each method above exists with its own Rust tests; no orchestrator assigns those fields directly; behaviour is unchanged, the existing tests pass untouched. Refined (2026-10-14, before queuing): `update()` is `edit()`, the confirmed term for a user's change from a form (`docs/ubiquitous-language.md`); the group's status is written through `update_group_status` from `bank_manual_match`, `overpayment` and `bank_statement_reconciliation`, its payment date in `context/fund/service.rs:303`, and `patient.ssn` in `fund_payment_reconciliation/orchestrator.rs:711`. Ships with DEBT-057, after DEBT-056. Size M holds, near the split line of § 11.

**Design:** none

**Open questions:** none
