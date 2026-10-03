# ADR 003 — Unit of Work for cross-aggregate atomicity

**Date**: 2026-04-28
**Status**: Accepted

## Context

Some operations must write to more than one aggregate in a single atomic DB transaction.
Injecting `sqlx::Pool` into use cases would violate B24 (use cases must not depend on
infrastructure types) and would make atomicity untestable without a real database.

The bounded contexts (`patient`, `fund`, `procedure`, `bank`) each own their repository
traits and SQLite implementations. Cross-context orchestrators that write several aggregates
as sequential calls have no atomicity guarantee: a failure mid-way leaves the data partly
written. Settling a fund payment group against the bank was the first such case (the
procedures of the group, then the group's status).

## Decision

Adopt the **Unit of Work pattern**: a shared, domain-blind transaction manager, and one unit
of work per atomic operation.

### 1. `SqlxTransactionManager` — `shared/infrastructure/uow.rs`

Created once at startup in `lib.rs`. It opens a transaction and knows no aggregate. A
transaction is committed explicitly; dropped without a commit, it rolls back.

### 2. A unit of work per atomic operation — `use_cases/{flow}/uow.rs`

The use case folder declares two traits, which is all an orchestrator sees:

```rust
/// The writes the operation makes, on one transaction.
pub trait GroupSettlementUnitOfWork: Send {
    async fn update_procedures(&mut self, procedures: Vec<Procedure>) -> Result<()>;
    async fn update_group_status(&mut self, group_id: &str, status: FundPaymentGroupStatus) -> Result<()>;
}

/// Runs an operation: committed on `Ok`, rolled back on `Err`.
pub trait GroupSettlementTransactionManager: Send + Sync {
    async fn run(&self, operation: GroupSettlementOperation) -> Result<()>;
}
```

The unit of work names the writes it needs; it does not inherit whole repository traits. The
manager trait is object-safe (`run` takes a boxed operation), so an orchestrator holds
`Arc<dyn …TransactionManager>`.

A use case imports no other use case (B18), so two flows that make the same writes — the
bank statement validation and the manual bank match both settle a group — each declare the
unit of work in their own folder.

The SQLite implementation sits beside the traits, in `use_cases/{flow}/sqlx_uow.rs`. It
implements the manager trait for `SqlxTransactionManager` and calls the row writers the
repositories already own, so no SQL is duplicated. This file is the one place under
`use_cases/` that names sqlx and concrete repositories (B26): `shared/` cannot import a
bounded context, and a bounded context cannot import a use case, so the implementation that
joins two contexts on one transaction has no other home.

### Execution flow

```
orchestrator
  ├── load aggregates            (reads, outside the unit of work)
  ├── apply domain logic         (pure, no DB)
  └── manager.run(|uow| { uow.update_procedures(..); uow.update_group_status(..) })
        ├── Ok  → commit   → notify through each owning service
        └── Err → rollback → propagate the error
```

Reads stay outside `run`: the transaction holds a connection, and a read through the pool
inside it would wait on a single-connection pool.

### Event emission

After `run` returns `Ok`, the use case calls the notify method of each service that owns an
event. It does not publish those events itself (B25).

## Alternatives Considered

**1. Inject `sqlx::Pool` into use cases directly.** Rejected: an infrastructure dependency in
the orchestrator (B24), and no unit test without a real database.

**2. Event-driven, eventual consistency.** Rejected where the spec requires atomicity. Where
an operation explicitly allows best-effort recording, it is the simpler choice.

**3. One global unit of work combining every repository.** Rejected: it couples all bounded
contexts. Each operation declares only the writes it needs.

**4. A generic `TransactionManager::run<T, F>` trait shared by every use case.** Rejected: a
generic method is not object-safe, so orchestrators could not hold it as `Arc<dyn …>` without
becoming generic themselves.

## Consequences

**Positive:**

- Orchestrators have no sqlx dependency and are testable with a test double of the manager.
- A failure between two writes can be forced in a test and is proven to apply neither
  (`use_cases/bank_manual_match/sqlx_uow.rs`, `test_todo_017_*`).
- Opening, committing and rolling back are in one place.
- No SQL is duplicated: repositories expose the row writers a unit of work reuses.

**Negative:**

- Each use case declares its own unit of work and manager trait, even when two use cases
  make the same writes: the traits and their thin SQLite glue are repeated, the SQL is not.
- The boxed operation carries a higher-ranked lifetime bound, which is harder to read than a
  plain closure.
- A repository's row writer takes a connection: a second way into the same SQL beside the
  repository trait.
- One sqlx file lives under `use_cases/`, an exception B26 has to name.

## References

- `docs/ddd-reference.md` § Unit of Work
- `docs/backend-rules.md` — B24, B25, B26
