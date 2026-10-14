# 2026-10-11 — DEBT-056 — Three batch writes are left without a caller by the statement validation's unit of work

**Found by:** `spec-checker`, on the pull request that closed DEBT-050 (a grep of `src-tauri/src` and `src-tauri/tests`)

**Where:** `src-tauri/src/context/fund/service.rs` (`FundPaymentService::create_groups_batch`), `src-tauri/src/context/procedure/service.rs` (`ProcedureService::create_procedures_batch_from_candidates`), `src-tauri/src/context/fund/repository.rs` and `src-tauri/src/context/fund/domain.rs` (`create_batch_groups`)

**Observation:** since a statement's validation writes through its unit of work (FPA-076), nothing in production calls these two service methods: each is reached only by its own unit tests (two for the first, one for the second). The repository method `create_batch_groups` is then called by `create_groups_batch` alone, so it goes with it, with its two repository tests and the two comments that name it in the mocks of `bank_statement_reconciliation` and `overpayment`. Not removed with DEBT-050: its pull request already rewrote one file of about a thousand lines, and the removal reaches two other bounded contexts' files. The row writer `insert_group_in` stays: the unit of work uses it.

**Size:** S

**Waits on the owner:** no

**Refined (2026-10-14, before queuing):** confirmed — `create_groups_batch` (`context/fund/service.rs:366`) and `create_procedures_batch_from_candidates` (`context/procedure/service.rs:270`) are reached only by their unit tests; `create_batch_groups` only by `create_groups_batch` and two repository tests. Done when: the three methods, their tests, the trait method with its mock expectations and the two comments that name it (`overpayment/orchestrator.rs:625`, `bank_statement_reconciliation/orchestrator.rs:562`) are gone; `insert_group_in` stays; `just harness` green. Comes before TODO-019 and DEBT-057: it removes one of DEBT-057's three sites. Size S holds.
