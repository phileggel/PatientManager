# 2026-10-18 — DEBT-076 — The overpayment spec and contract promise a transaction the code does not run

**Found by:** `spec-checker` on `docs/spec/overpayment.md`, release sweep of the batch of 2026-10-18

**Where:** `docs/spec/overpayment.md` (REF-050, REF-170, REF-210); `docs/contracts/overpayment-contract.md`; `src-tauri/src/use_cases/overpayment/orchestrator.rs:57-365`; `src-tauri/src/use_cases/procedure_orchestration/service.rs` (REF-170's two updates); `docs/adr/002-overpayment-cascade-no-transaction.md`

**Observation:** the spec and the contract say each cascade runs in one database transaction that rolls back; the code runs its steps one by one, as ADR-002 decided. ADR-002's main reason — no orchestrator used explicit transactions — no longer holds since ADR-003 (Unit of Work) was accepted. Either the documents are corrected to ADR-002, or the cascades move onto the Unit of Work and ADR-002 is superseded. The contract also omits `DatabaseError` on `cancel_overpayment`.

**Size:** M

**Waits on the owner:** yes — keep ADR-002 (correct the spec and contract) or supersede it (cascades in a Unit of Work)
