# 2026-10-11 — DEBT-057 — A use case builds the lines of a fund payment group itself

**Found by:** `reviewer-arch` in CI, on PR #261 (the local run of the same lane had not raised it)

**Where:** `src-tauri/src/use_cases/fund_payment_reconciliation/orchestrator.rs` (`plan_groups`), `src-tauri/src/use_cases/overpayment/orchestrator.rs`, `src-tauri/src/context/fund/service.rs` (`create_groups_batch`), `src-tauri/src/context/fund/domain.rs`

**Observation:** `FundPaymentGroup::new` is given an empty list of lines, then the caller builds each `FundPaymentLine` with the new group's identifier and assigns `group.lines` — an internal entity created and an aggregate's collection set from outside the aggregate root (B7, B9). The fund service did it first; PR #261 moved one such site from the service into a use case, where it is the second with `overpayment`. A factory on the group that takes the procedure identifiers and builds its own lines removes the three sites. Its name is a term of the aggregate, to confirm in the vocabulary; it sits with TODO-019, which gives `FundPaymentGroup` its other methods.

**Size:** S

**Waits on the owner:** the name of the factory, with TODO-019
