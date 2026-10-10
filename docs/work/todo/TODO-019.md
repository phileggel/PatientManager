# TODO-019 — (backend) — `Patient` and `FundPaymentGroup` changes go through aggregate methods

Third entry split from TODO-006. Same move as TODO-018 for the two smaller aggregates: `Patient::correct_ssn()`, and `confirm_bank_payment()`, `revert_bank_payment()`, `update()` on `FundPaymentGroup`.

**User value:** none directly — the rules of these two aggregates live in one place and are tested there.

**Done when:** each method above exists with its own Rust tests; no orchestrator assigns those fields directly; behaviour is unchanged, the existing tests pass untouched.

**Design:** none

**Open questions:** none
