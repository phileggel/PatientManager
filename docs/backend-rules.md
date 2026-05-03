# Backend Rules

> For DDD concept definitions, see [docs/ddd-reference.md](ddd-reference.md).

**AI AGENT SHOULD NEVER UPDATE THIS DOCUMENT**
**Rules numbering are indicative and not stable from version to version**

## Folder Structure

**B0** — The backend source tree MUST follow this layout:

```
src-tauri/src/
├── core/             # Shared infrastructure (db, logger, event_bus, specta)
│   ├── db.rs
│   ├── logger.rs
│   ├── specta_types.rs
│   ├── specta_builder.rs
│   ├── uow.rs            # TransactionManager trait + SqlxTransactionManager
│   └── event_bus/
│       ├── bus.rs
│       ├── event.rs
│       └── mod.rs
├── context/          # DDD bounded contexts — no cross-context imports
│   └── {domain}/
│       ├── {aggregate}/  # One sub-folder per aggregate root in the BC
│       │   ├── domain.rs     # Entity, value objects, repository trait
│       │   ├── repository.rs # SQLite implementation of the repository trait
│       │   └── service.rs    # BC Application Service — optional (see B21)
│       ├── api.rs        # Single Tauri adapter for the whole BC (thin — no business logic)
│       └── mod.rs        # Public re-exports only — the only import surface for the BC
├── use_cases/        # Cross-context orchestrators (if needed)
│   └── {name}/
│       ├── api.rs          # Tauri adapter — same framework boundary role as BC api.rs
│       ├── mod.rs          # Public re-exports
│       ├── orchestrator.rs # Main entry point — coordination logic only, no domain rules
│       └── uow.rs          # AppUnitOfWork super-trait for this use case (if cross-aggregate)
└── lib.rs            # App wiring: state construction + Tauri setup
```

**B1** — `core/` MUST only contain infrastructure utilities with no domain knowledge.

**B2** — `context/{domain}/{aggregate}/repository.rs` MUST only contain the database implementation of the trait declared in the same aggregate's `domain.rs`. No business logic.

**B3** — `core/specta_builder.rs` is the ONLY place where Tauri commands are registered.

**B4** — A bounded context MAY contain multiple aggregate roots. Each aggregate MUST have its own sub-folder. Aggregates within the same BC reference each other by ID only — never by direct object reference.

## Ubiquitous Language

**B5** — Domain vocabulary (entity names, aggregate method names, event names, domain concepts)
MUST be defined and validated by the user before use in code, tests, or documentation.
The agent MUST NOT unilaterally decide on domain terms — it MUST propose and wait for
explicit confirmation. All confirmed terms MUST be recorded in `docs/ubiquitous-language.md`
and used consistently everywhere.

**B6** — All new code MUST use the vocabulary confirmed in `docs/ubiquitous-language.md`.
If a confirmed term differs from the current code name (recorded as a code discrepancy in
the UL doc), new code uses the confirmed term and a rename of the existing code is scheduled.
The UL doc is the source of truth — not the current codebase.

## Domain Object

**B7** — Domain objects MUST be created with a factory method:

- `new()` — validates fields and generates id (use in service or use case)
- `with_id()` — validates fields, uses provided id (use in service, use case, or api)
- `restore()` — direct restore from database, no validation (use in repository only)

Exception: internal aggregate entities have factory methods that are called ONLY from within
the Aggregate Root's methods — never from services, use cases, or api.rs directly.

Immutable domain concepts with no identity SHOULD be modelled as Value Objects (no ID, no factory method — constructed directly).

## Aggregate

**B8** — The BC's root entity (named after the BC folder, e.g. `Order` in `context/order/`) is the Aggregate Root. External code MUST NOT mutate internal entities directly. Reading internal entities for query purposes is acceptable (CQRS-lite).

**B9** — All mutations to internal entities MUST go through the Aggregate Root methods or its BC Application Service. No external code constructs or mutates internal entities directly.

**B10** — One database transaction SHOULD modify at most one aggregate. Cross-aggregate writes require the UnitOfWork pattern.

**B11** — Aggregate Root methods MUST use domain/business vocabulary — they describe what
happens to the aggregate, not the internal mechanism.

> ✅ `root.perform_action()` — `root.cancel(reason)`
> ❌ `root.status = Status::Cancelled` — `root.with_status(...)`

**B12** — Boy scout rule: when a use case or service needs to mutate an aggregate field
directly, extract an Aggregate Root method for that mutation first, then call the method.
Never add a new direct field mutation to an aggregate from outside its own type.
Existing direct mutations are tracked in `docs/ubiquitous-language.md` as code discrepancies
and MUST be refactored incrementally.

## Bounded Context (`/context`)

**B13** — MUST never import from another context.

**B14** — MUST share its external API directly through its main `mod.rs`.

- Outside the context, never import `crate::context::{domain}::domain::{Entity}` — always import `crate::context::{domain}::{Entity}`.

**B15** — SHOULD always publish a `{Domain}Updated` event when its state changes (create, update, delete, etc.). The BC Application Service (`service.rs`) is responsible for event emission. If no Application Service exists, the `api.rs` handler is responsible.

**B16** — `api.rs` is the framework boundary — the only layer that knows Tauri exists.
Its sole responsibilities are:

1. **Deserialize** — translate Tauri command arguments into domain types
2. **Delegate** — make exactly one call to its own BC Application Service
3. **Serialize** — map the result to `Result<T, String>` for Tauri

It MUST only call the Application Service of its own bounded context.
It MUST NOT call another BC's service, another BC's repository, or a use case.
Cross-BC coordination belongs in a use case with its own `api.rs`.

**B17** — MUST declare its Tauri commands in the `api.rs` file.

## Use Cases (`/use_cases`)

**B18** — MAY import from contexts, MUST NOT import from another use case.

**B19** — MUST share its external API directly through its main `mod.rs`.

**B20** — MUST NOT publish a `{Domain}Updated` event directly (orchestrators do not own state).
For cross-aggregate UoW operations, MUST delegate notification to each BC service's notify
method after commit — the service owns the event, not the use case.

**B21** — MUST declare its Tauri commands in its own `api.rs` file. This `api.rs` follows
the same framework boundary role as for Bounded Context: deserialize → delegate to the use case orchestrator
→ serialize. It MUST NOT contain coordination logic — that belongs in the orchestrator.

**B22** — SHOULD have an orchestrator as its main entry point (after api) that handles the global logic.

## Application Service (BC)

**B23** — A bounded context service (`service.rs`) is a BC-scoped Application Service. Its
primary role is to emit domain events after state changes: load via repository → call
Aggregate Root method → save → emit event. All domain logic (invariants, calculations,
state transitions) MUST live in the Aggregate Root — the service is a thin coordinator.
It MUST only exist when event emission or aggregate coordination adds value; trivial CRUD
with no event does not justify a service. A service MUST NOT expose repository types or
sqlx types in its public signature.

## Use Case Orchestrator

**B24** — Use cases MAY depend on any domain abstraction: repository traits, domain entities,
or bounded context services. They MUST NOT depend on infrastructure: concrete repository
implementations, `sqlx::Pool`, `sqlx::Transaction`, `sqlx::query!`, or any other sqlx type.

**B25** — For write operations that must emit an event, use cases SHOULD go through the BC Application Service rather than the repository trait directly to ensure the event is properly fired.

**B26** — For cross-aggregate writes (operations that must write to more than one aggregate
atomically), the use case orchestrator MUST use the UnitOfWork pattern (`TransactionManager`
from `core/uow.rs`). Single-aggregate writes do NOT use UoW — the aggregate's own repository
handles atomicity internally via its `save()` method.

## Repository

**B27** — MUST use sqlx macros for queries. Use your project's DB reset command to wipe and re-migrate if needed.

## Logging

**B28** — MUST use `tracing::{info, debug, warn, error}` with structured fields. Never use `println!`.

**B29** — MUST use `target:` field when adding a new backend specific log.

**B30** — When using the `target:` field in tracing calls, MUST use a named constant instead of a string literal. Define `BACKEND` / `FRONTEND` constants in a shared `core::logger` module and reference them:

```rust
// Define once in core/logger.rs:
pub const BACKEND: &str = "backend";

// Use everywhere:
tracing::info!(target: BACKEND, field = value, "message");
```

## General

**B31** — MUST use `anyhow::Result<T>` for error handling.

- Exception: Tauri command responses use `Result<T, String>`.

**B32** — MAY use `#[allow(clippy::too_many_arguments)]` on domain factory methods and production constructors (e.g. orchestrator or service new() with many injected dependencies). MUST NOT use on test helpers — use a builder struct instead.

## Tests

**B33** — Tests MUST NOT be trivial. A trivial test is one that verifies:

- A constructor does not panic
- An empty input returns empty output (no logic traversed)
- A getter returns what was just passed in
- A test helper disguised as a test

**B34** — Unit tests & mock

- Tests for services and orchestrators (inline #[cfg(test)] in src/) SHOULD mock external dependencies using mockall-generated mocks.
- Exception: tests for concrete repository implementations MUST use a real database (in-memory or isolated test instance) instead of mocks.

**B35** — Integration tests (tests/ folder) MUST use real database repos. They test cross-layer behavior end-to-end and MUST NOT use mocks.

**B36** — e2e tests MUST use an ephemeral database.
