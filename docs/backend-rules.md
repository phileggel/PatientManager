# Backend Rules

**AI AGENT SHOULD NEVER UPDATE THIS DOCUMENT**

## Domain Object

**B1** — MUST be created with a factory method:

- `new()` — validates fields and generates id (use in service)
- `with_id()` — validates fields, uses provided id (use in api/service)
- `restore()` — direct restore from database, no validation (use in repository only)

## Bounded Context (`/context`)

**B2** — MUST never import from another context.

**B3** — MUST share its external API directly through its main `mod.rs`.

- Outside the context, never import `crate::context::patient::domain::Patient` — always import `crate::context::patient::Patient`.

**B4** — SHOULD always publish a `{Domain}Updated` event when its state changes (create, update, delete, etc.).

**B5** — MUST declare its Tauri commands in the `api.rs` file.

## Use Cases (`/use_cases`)

**B6** — MAY import from contexts, MUST NOT import from another use case.

**B7** — MUST share its external API directly through its main `mod.rs`.

**B8** — MUST NOT publish a `{Domain}Updated` event (orchestrators do not own state).

**B9** — MUST declare its Tauri commands in the `api.rs` file.

**B10** — SHOULD have an orchestrator as its main entry point (after api) that handles the global logic.

## Repository

**B11** — MUST use sqlx macros for queries. Use `just clean-db` to reset the database if needed.

## Logging

**B12** — MUST use `tracing::{info, debug, warn, error}` with structured fields. Never use `println!`.

**B16** — When using the `name:` field in tracing calls, MUST use the `BACKEND` constant from `crate::core::logger` instead of the string literal `"backend"`:

```rust
use crate::core::logger::BACKEND;
tracing::info!(name: BACKEND, field = value, "message");
```

## General

**B13** — MUST use `anyhow::Result<T>` for error handling.

- Exception: Tauri command responses use `Result<T, String>`.

**B14** — MAY use `#[allow(clippy::too_many_arguments)]` on domain factory methods.

## Tests

**B15** — Tests MUST NOT be trivial. A trivial test is one that verifies:

- A constructor does not panic
- An empty input returns empty output (no logic traversed)
- A getter returns what was just passed in
- A test helper disguised as a test
