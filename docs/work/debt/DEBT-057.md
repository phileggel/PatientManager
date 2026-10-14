# 2026-10-11 — DEBT-057 — A use case builds the lines of a fund payment group itself

**Found by:** `reviewer-arch` in CI, on PR #261 (the local run of the same lane had not raised it)

**Where:** `src-tauri/src/use_cases/fund_payment_reconciliation/orchestrator.rs` (`plan_groups`), `src-tauri/src/use_cases/overpayment/orchestrator.rs`, `src-tauri/src/context/fund/domain.rs`

**Observation:** `FundPaymentGroup::new` is given an empty list of lines, then the caller builds each `FundPaymentLine` with the new group's identifier and assigns `group.lines` — an internal entity created and an aggregate's collection set from outside the aggregate root (B7, B9). The fund service did it first; PR #261 moved one such site from the service into a use case, where it is the second with `overpayment`. A factory on the group that takes the procedure identifiers and builds its own lines removes the three sites. Its name is a term of the aggregate, to confirm in the vocabulary; it sits with TODO-019, which gives `FundPaymentGroup` its other methods.

**Size:** S

**Waits on the owner:** no — no new term: `FundPaymentGroup::new` and `with_id` take the procedure identifiers instead of the lines and build them (owner, 2026-10-14)

**Refined (2026-10-14, before queuing):** ships with TODO-019. Sites left after DEBT-056: `fund_payment_reconciliation/orchestrator.rs:234` and `overpayment/orchestrator.rs`. Done when: the group builds its own lines from the procedure identifiers, through `new` and `with_id` taking the procedure identifiers; no caller assigns `group.lines` outside the repository's restore path; Rust tests on the factory. Size S holds.
