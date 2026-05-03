# DDD Reference

A concise reference for Domain-Driven Design concepts as applied in a Tauri 2 / Rust / React stack.

---

## Layers (within a Bounded Context)

DDD defines three layers inside every bounded context. Outer layers depend on inner ones — never the reverse.

```
┌─────────────────────────────────┐
│       Infrastructure Layer      │  ← depends on Application + Domain
├─────────────────────────────────┤
│       Application Layer         │  ← depends on Domain only
├─────────────────────────────────┤
│          Domain Layer           │  ← depends on nothing
└─────────────────────────────────┘
```

---

## Domain Layer

The core of the BC. No infrastructure dependencies — no sqlx, no HTTP, no file I/O.

### Entity

Has a unique identity (ID). Mutable over time. Two entities with the same ID are the same object regardless of attribute values.

> Examples: `Order`, `Customer`, `Product`

### Value Object

No identity. Defined entirely by its attributes. Immutable — replace, never mutate.

> Examples: `Money`, `DateRange`, `Currency`

### Aggregate

A cluster of entities and value objects treated as a single unit. Has one **Aggregate Root**.

- External code MUST NOT mutate internal entities directly — all mutations go through the root.
- External code MAY read internal entities for query purposes (CQRS-lite).
- One transaction = one aggregate (the consistency boundary).
- Aggregate root methods use domain/business vocabulary — they describe what happens to the
  aggregate, not the internal mechanism. e.g. `root.perform_action()` not `root.set_status()`.
  > Example: `Order` (root) + `OrderLine` (internal) + `Payment` (internal)

### Domain Service

Stateless. No repository dependencies. Handles domain logic that spans multiple aggregates and cannot live in any single one.

> Example: a `PriceCalculator` that reads two aggregates and computes a result.
> These are rare — most logic belongs in an entity or aggregate.

### Repository Interface

Declares persistence operations. Lives in the domain layer — only the interface, never the implementation.

### Domain Event

A record of something that happened. Raised by aggregates after a state change. Immutable.

> Examples: `OrderPlaced`, `PaymentRecorded`

---

## Application Layer (within a BC)

Orchestrates domain objects to fulfill use cases that belong entirely to one BC. Contains no business rules — it delegates all logic to the domain.

### Application Service (`service.rs`)

- Orchestrates the aggregate: load via repository → call Aggregate Root method → save → emit event
- Contains no domain logic — all invariants, rules, and calculations live in the Aggregate Root
- MAY enforce cross-aggregate invariants that require persistence (e.g. uniqueness checks across the BC)
- Dispatches domain events after state changes by calling a notify method — never publishes directly
- MUST NOT expose infrastructure types in its public signature
- Optional — only exists when this orchestration adds value beyond trivial CRUD

---

## Infrastructure Layer

Contains all external concerns. Depends on the domain layer (implements its interfaces).

### Repository Implementation

Concrete persistence (SQLite, HTTP, etc.) of a repository interface declared in the domain layer.

---

## Cross-cutting Application Layer (`use_cases/`)

Orchestrates multiple bounded contexts when no single BC owns the full operation. This is a second, higher-level application layer sitting above all BCs.

- Coordinates BC Application Services and/or repository traits from different contexts
- Handles transactions spanning multiple BCs (via UnitOfWork)
- Contains no domain rules — it only coordinates
- MUST NOT publish domain events (it does not own state)

---

## Bounded Context

A semantic boundary within which a single domain model applies consistently. Concepts from one BC must not leak into another.

- Each BC has its own entities, repos, and language — the same word can mean different things in different BCs
- BCs communicate through events or explicit use cases, never through shared domain objects
- Exposed through `mod.rs` only — never import from `domain/` directly from outside the BC

---

## Unit of Work (UoW)

A pattern for cross-aggregate atomicity. Used when a single operation must write to multiple
aggregates in one DB transaction.

### TransactionManager

A shared application infrastructure trait (lives in `core/`). Wraps the DB pool and provides
a closure-based API: `run(|uow| { ... })` — begins a transaction, executes the closure, commits
on success, rolls back on failure.

### AppUnitOfWork

A use-case-specific super-trait combining the repository traits needed for one atomic operation.
e.g. `AppUnitOfWork: OrderRepository + InventoryRepository`. Lives in the use case folder.
Implemented by `SqlxUnitOfWork` in infrastructure (holds a shared `sqlx::Transaction`).

### When to use

Only when a single business operation must write to more than one aggregate atomically and
eventual consistency is not acceptable. Single-aggregate writes do NOT use UoW — the
aggregate's own repository handles atomicity internally via its `save()` method.

### Event emission with UoW

After `tx_manager.run()` returns `Ok`, the use case delegates notification to each BC
service's notify method — it does not publish events directly (use cases do not own state).

---

## Dependency Rule (summary)

| Layer                    | May depend on                   |
| ------------------------ | ------------------------------- |
| Infrastructure           | Application, Domain             |
| Application Service (BC) | Domain only                     |
| Cross-cutting Use Case   | Domain abstractions from any BC |
| Domain                   | Nothing                         |

Infrastructure types (`sqlx::Pool`, concrete repos) must never appear in Application or Domain layers.
