# DDD Reference

A concise reference for Domain-Driven Design concepts as applied in a Tauri 2 / Rust stack.

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

> In the project's Rust convention, the application layer lives in `context/{bc}/application/` per BC. See `backend-rules.md` § Folder Structure for the gold layout.

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
- BCs communicate through events or explicit use cases. The documented exception is the **Shared Kernel** (see below) — a deliberately-shared subset of the domain that two or more BCs agree on
- Exposed through `mod.rs` only — never import from `domain/` directly from outside the BC

---

## Shared Kernel

A deliberately-shared subset of the domain between two or more BCs. The Shared Kernel is the EXCEPTION to the rule that BCs communicate only through events or use cases — it's a recognised DDD pattern for the small set of domain concepts that genuinely need a single, agreed-upon representation across BCs.

**What lives there**

- Cross-context constants (e.g. ID formats, currency codes, system-wide IDs)
- Value objects whose identity must agree across BCs
- Trait shapes that several BCs implement and several other BCs consume

**What does NOT live there**

- Anything one BC can own alone — move to that BC
- Infrastructure concerns (HTTP clients, DB adapters) — those go in `shared/infrastructure/`
- Cross-BC orchestration logic — that's a use case in `use_cases/`

**Where in the layout**

Per the project's Rust convention (`backend-rules.md` § Folder Structure): `shared/domain/`. Files here are the only place outside an individual BC's `domain/` where domain code may live.

**Discipline**

Shared Kernel is a tightly-coupled relationship — every change requires agreement from every BC that uses it. Keep it small. Default to use cases or domain events for cross-BC interaction; only adopt Shared Kernel when those alternatives genuinely don't fit.

---

## Unit of Work (UoW)

A pattern for cross-aggregate atomicity. Used when a single operation must write to multiple
aggregates in one DB transaction.

### The shared transaction manager

`SqlxTransactionManager` (`shared/infrastructure/uow.rs`) wraps the DB pool and opens a
transaction. It knows no aggregate.

### A unit of work per atomic operation

The use case folder declares two traits (ADR-003): the unit of work, which names the writes
the operation makes (e.g. `update_procedures`, `update_group_status`), and its transaction
manager, whose `run(operation)` commits on success and rolls back on failure. Orchestrators
see only these traits. The SQLite implementation sits beside them and calls the row writers
the repositories own.

### When to use

Only when a single business operation must write to more than one aggregate atomically and
eventual consistency is not acceptable. Single-aggregate writes do NOT use UoW — the
aggregate's own repository handles atomicity internally via its `save()` method.

### Event emission with UoW

After the manager's `run()` returns `Ok`, the use case delegates notification to each BC
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

> Concepts and rules below — where errors come from, how they travel. For the how-to (where to add a variant, the flat-`{BC}Error` shape, use-case composites, wire format, Tauri boundary), see [`error-model.md`](error-model.md).

### Three categories of errors (origin, not type)

These categories describe **where an error originates** and what vocabulary it speaks. They do _not_ map to separate Rust types — in the flat-`{BC}Error` model, all three live as variants of a single per-BC enum (see [`error-model.md`](error-model.md) § The rule). The categories are still useful for reasoning about whether a variant belongs in `{BC}Error`, `{UseCase}Error`, or nowhere at all.

- **Domain origin** — a violation of a business rule or invariant raised by aggregate code. Expressed in ubiquitous language. Examples: `OrderNotPaid`, `InsufficientStock`, `CannotCancelShippedOrder`.
- **Application origin** — a use-case / service concern that is not itself a business rule. Examples: `OrderNotFound`, `Unauthorized`, precondition for running the use case not met.
- **Infrastructure origin** — a purely technical failure with no business meaning. Examples: I/O failure, file not found, DB timeout, deserialization error, network failure.

Test for classification: _would a domain expert recognize this concept?_ If yes → domain origin. If it's about running the use case → application origin. If it's plumbing → infrastructure origin.

### Rejection-layer rule

The classification test above can be ambiguous for variants like `NotFound` or uniqueness checks — they're raised by the service before any aggregate is loaded, so the "would a domain expert recognize this?" question is easy to answer either way. The rejection-layer rule resolves where the variant lives:

> A variant raised by an aggregate method (or value-object constructor) enforcing an invariant on its own loaded state or input has **domain origin**.
>
> A variant raised by the service or use-case layer — `NotFound`, uniqueness checks, cross-BC preconditions, translated infrastructure failures — has **application origin**.

Both go into the same `{BC}Error` enum. The distinction matters for reasoning ("could this rule move into the aggregate?"), not for Rust typing.

Concretely:

- **Aggregate-method rejection** → domain origin. `Order::apply_payment(&mut self, payment) -> Result<Payment, OrderError>` enforcing `InsufficientFunds` on loaded state.
- **Service-level pre-check** → application origin. `if repo.find(id).is_none() { return Err(OrderError::OrderNotFound { ... }) }` runs before any aggregate is loaded.
- **Use-case orchestrator rejection** (cross-BC preconditions, in-flight guards) → use-case-specific. Variant of `{UseCase}Task` (a tagged sub-enum wired into `{UseCase}Error` via `#[from]`), e.g. `ProcessOrderTask::ProcessAlreadyRunning.into()`. Not in any BC's enum.
- **Translated infrastructure failure** → application origin. `repo.something().await.map_err(|e| { tracing::error!(...); OrderError::DatabaseError })?` at the service call site. Unit variant — no `hint` payload. The full diagnostic chain is preserved server-side via the `tracing::error!` call, not on the wire.

The rule has a useful side-effect: if a service-level pre-check could be moved into the aggregate, the rejection-layer rule says it _should_ be — see the anemic-domain rule in `backend-rules.md`.

### Scoping

One flat `{BC}Error` per bounded context, every variant side by side — never split per
aggregate or per layer. A use case composes BC enums in `{UseCase}Error`
([`error-model.md`](error-model.md) builds both).

### Travel rule

An error may move up a layer only if it is meaningful in that layer's vocabulary. Otherwise it must be translated at the boundary.

- Domain-origin and application-origin variants of `{BC}Error` are meaningful at every layer above — they speak the BC's language and reach the UI as-is.
- Infrastructure-origin failures (raw `sqlx::Error`, `io::Error`, network errors) are meaningful only at the infrastructure layer. They must be translated at the service call site into `{BC}Error::DatabaseError` (or another named variant if the failure has a more specific meaning) before they cross into the application layer. The diagnostic chain is preserved via `tracing::error!`, not via a wire payload.

### Principles

- Infrastructure error _details_ are logged at the translation site (`tracing::error!`),
  never returned: the user sees a typed, named code, never an opaque string or a backtrace.
- The dependency arrow points inward: a `sqlx::Error` in a domain `Result` couples the
  domain to a storage choice.
- The contract is the same whether the UI calls a use case (`{UseCase}Error`) or a BC's
  application service (`{BC}Error`): a typed `Result`, infrastructure translated at the
  call site. The choice between them is code organisation, not error modelling.
