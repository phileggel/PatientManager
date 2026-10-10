# TODO-018 — (backend) — `Procedure` changes go through aggregate methods

Second entry split from TODO-006. Orchestrators mutate the fields of `Procedure` directly; the transitions belong on the aggregate root: `reconcile()`, `unreconcile()`, `dispute()`, `record_payment()`, `revert_payment()`, `clear_payment()`, `correct_billed_amount()`, `correct_fund()`, `correct_date()`.

**User value:** none directly — each rule of a procedure's lifecycle lives in one place and is tested there.

**Done when:** each transition above is a method on `Procedure` with its own Rust tests, including the refused transitions; no orchestrator assigns a `Procedure` status or payment field directly; behaviour is unchanged, the existing tests pass untouched.

**Design:** none

**Open questions:** none
