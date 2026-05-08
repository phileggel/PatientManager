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

---

## Errors

### Three categories of errors

- **Domain error** — a violation of a business rule or invariant. Belongs to the domain layer. Expressed in ubiquitous language. Examples: `OrderNotPaid`, `InsufficientStock`, `CannotCancelShippedOrder`.
- **Application error** — a use-case / orchestration concern that is not itself a business rule. Examples: `OrderNotFound`, `Unauthorized`, precondition for running the use case not met.
- **Infrastructure error** — a purely technical failure with no business meaning. Examples: I/O failure, file not found, DB timeout, deserialization error, network failure.

Test for classification: _would a domain expert recognize this concept?_ If yes → domain. If it's about running the use case → application. If it's plumbing → infrastructure.

### Scoping rule

Domain errors should be scoped per aggregate or operation (`OrderError`, `PaymentError`), not collected into a single mega-enum for the whole bounded context. This keeps the language tight and the variants meaningful.

### Travel rule

An error may move up a layer only if it is meaningful in that layer's vocabulary. Otherwise it must be translated at the boundary.

- Domain errors are meaningful at every layer (they are business language).
- Application errors are meaningful at the application and UI layers.
- Infrastructure errors are meaningful only at the infrastructure layer.

### Flow toward the UI

- **Domain error** → reaches the UI essentially as-is. It may be structurally wrapped in the outer error enum so the application boundary returns a single `Result<T, E>`, but its meaning is not transformed.
- **Application error** → goes straight to the UI. It was born at the application layer speaking the UI's language.
- **Infrastructure error** → must be translated at the application boundary. Either into a meaningful application error (e.g. `RepoError::NotFound` → `OrderNotFound`), or into an opaque variant (e.g. `Io`, `Deserialize` → generic `Infrastructure` / 500). Raw infrastructure errors never cross into the UI.

### Principles

- Lower layers do not know about upper layers. Errors flow upward and become progressively more abstract and user-appropriate.
- Infrastructure error _details_ are logged, not returned. The user-facing response stays generic ("something went wrong"); the diagnostic detail goes to the logs.
- Structural wrapping (putting a domain error inside the outer enum) is not the same as semantic translation (changing what the error means). Domain errors are wrapped, not translated. Infrastructure errors are translated.
- The dependency arrow points inward: the domain must not depend on infrastructure error types. If `FileNotFound` leaks into a domain `Result`, the domain has implicitly become coupled to a storage choice.

### Application boundary: use case vs application service

The error contract is identical whether the UI calls:

- a **use case / interactor / orchestrator** (one class per use case, Clean Architecture style), or
- an **application service** (one class grouping related use cases as methods, classical DDD style).

In both cases the application boundary:

1. Exposes `Result<T, AppError>` (or a per-operation error enum) to the UI.
2. Orchestrates domain and infrastructure.
3. Translates infrastructure errors into application errors.
4. Wraps domain errors structurally without altering their meaning.

The choice between the two is about code organization (granularity, cohesion, testability), not about how errors are modeled or propagated.

### Rust shape (illustrative)

```rust
// domain layer
pub enum OrderError {
    NotPaid,
    AlreadyShipped,
    EmptyCart,
}

// infrastructure layer
pub enum RepoError {
    NotFound,
    Io(std::io::Error),
    Deserialize(serde_json::Error),
}

// application layer — per use case, or grouped in a service
pub enum PlaceOrderError {
    Domain(OrderError),         // wrapped, not translated
    OrderNotFound,              // translated from RepoError::NotFound
    Unauthorized,               // born at this layer
    Infrastructure,             // opaque catch-all for plumbing failures
}
```

At the UI boundary, `PlaceOrderError` is mapped to the user-facing response (HTTP status, view model, CLI exit code, etc.). Domain and application variants get specific messages; the `Infrastructure` variant becomes a generic failure response, with details only in logs.
