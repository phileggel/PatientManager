# TODO-018 — (backend) — `Procedure` changes go through aggregate methods

Second entry split from TODO-006. Orchestrators mutate the fields of `Procedure` directly; the transitions belong on the aggregate root: `reconcile()`, `unreconcile()`, `dispute()`, `record_payment()`, `revert_payment()`, `clear_payment()`, `correct_billed_amount()`, `correct_fund()`, `correct_date()`.

**Size:** L — nine transitions, two or three pull requests.

**User value:** none directly — each rule of a procedure's lifecycle lives in one place and is tested there.

**Done when:** each transition above is a method on `Procedure` with its own Rust tests, including the refused transitions; no orchestrator assigns a `Procedure` status or payment field directly; behaviour is unchanged, the existing tests pass untouched. Refined (2026-10-17): about 26 direct assignments read in the use cases — `fund_payment_reconciliation/orchestrator.rs` (8), `fund_payment_manual_management/orchestrator.rs` (8), `bank_manual_match/orchestrator.rs` (4), `bank_statement_reconciliation/` (4), the units of work (2); the aggregate has `with_payment_info`, `clear_payment_info`, `revert_fund_payment` already. Two pull requests: the fund-payment use cases, then the bank ones with the three `correct_*`. Answer (owner, 2026-10-17): the methods add the refusals, so behaviour changes at the edges and the "unchanged" clause no longer holds — each refused transition is a spec rule of `docs/spec/procedure-orchestration.md`, written with `/spec-writer`, and a typed error the screens show. About three pull requests after the interview; moved to the next batch (owner, 2026-10-17).

**Design:** none

**Linked (owner, 2026-10-18):** one story with TODO-024 (the backend is the only judge of a form; the screen shows each refusal at its field) and DEBT-043's form validators; planning slices them together.

**Open questions:**

- [ ] Which transition is refused from which status, and what the user reads for each — the `/spec-writer` interview, before the work.
- [ ] The size: proposed L (three pull requests and a spec interview), for the owner to confirm.
