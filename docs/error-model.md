# Error Model

Reference for handling errors in this codebase. Directive, not historical. Conceptual framing of where errors come from lives in [`ddd-reference.md`](ddd-reference.md) § Errors; this doc gives the how-to.

---

## The rule

**One flat enum per bounded context (`{BC}Error`).** Holds every variant the BC can raise — aggregate-invariant errors raised by domain methods AND lookup / state / infra errors raised by services. No Domain / Application split inside the BC.

**One composite per use case (`{UseCase}Error`).** Wraps the BC enums the use case touches via `#[from]` + adds use-case-specific flat variants (cross-BC guards, in-flight checks, catch-alls). Serialized with `#[serde(untagged)]` so the wrappers disappear on the wire.

**Contracts describe the wire shape only.** `docs/contracts/{bc}-contract.md` lists per-command wire-visible variant codes; Rust-internal type names (BC enums, composite enums) are not exposed in contracts.

---

## Decision tree

> I'm adding or changing an error path. Where does it go?

- **Aggregate-invariant violation** (raised by a domain method on loaded state, e.g. `Order::apply_payment` rejecting `InsufficientFunds`)
  → variant of `{BC}Error`.

- **Service-layer error** (NotFound from `repo.get_by_id`, uniqueness pre-check, cross-aggregate gating within the BC)
  → variant of `{BC}Error`.

- **Infra failure** (sqlx error, repo I/O, connection lost)
  → translate to `{BC}Error::DatabaseError` at the call site, log via `tracing::error!`:

  ```rust
  repo.something().await.map_err(|e| {
      tracing::error!(target: BACKEND, ..context fields.., err = ?e, "service_method: what failed");
      OrderError::DatabaseError
  })?;
  ```

- **Use-case-specific guard** (cross-BC verdict like `InventoryUnavailable`; orchestrator-level check like `ProcessAlreadyRunning`)
  → flat variant in `{UseCase}Error`.

- **Unexpected catch-all in a use case** (panic-kind; sync infra failure not attributable to a specific BC's database)
  → `{UseCase}Error::UnknownError`.

- **Need a payload on the wire?**
  → struct variants. Tuple variants don't survive `#[serde(tag = "code")]`.

  ```rust
  { code: "OutOfStock"; available: number; requested: number }
  ```

---

## Recipes

### BC enum

```rust
#[derive(Debug, thiserror::Error, serde::Serialize, specta::Type, Clone)]
#[serde(tag = "code")]
pub enum OrderError {
    #[error("Insufficient funds: available {available_micros}, required {required_micros}")]
    InsufficientFunds { available_micros: i64, required_micros: i64 },

    #[error("Order reference cannot be empty")]
    ReferenceEmpty,

    #[error("Order not found: {order_id}")]
    OrderNotFound { order_id: String },

    #[error("Order reference already exists")]
    ReferenceAlreadyExists,

    #[error("An unexpected database error occurred")]
    DatabaseError,
}
```

A single enum holds every variant the BC can raise. Aggregate-invariant variants (`InsufficientFunds`, `ReferenceEmpty`) and service-layer variants (`OrderNotFound`, `ReferenceAlreadyExists`, `DatabaseError`) sit side by side. The reader sees the BC's full failure surface in one type.

### Use-case composite

```rust
#[derive(Debug, thiserror::Error, serde::Serialize, specta::Type)]
#[serde(untagged)]
pub enum ProcessOrderError {
    #[error(transparent)]
    Order(#[from] OrderError),

    #[error(transparent)]
    Inventory(#[from] InventoryError),

    #[error("An order is already being processed")]
    ProcessAlreadyRunning,

    #[error("No line items in scope")]
    NoLineItemsToProcess,

    #[error("Unexpected error")]
    UnknownError,
}
```

Wrapper variants propagate BC errors via `?` (thanks to `#[from]`). Use-case-specific variants are flat (no inner enum) and constructed explicitly. All variants serialize as `{ code: "..." }` on the wire via `untagged`.

### Service method signature

```rust
pub async fn record_payment(...) -> Result<Payment, OrderError> {
    let mut order = load_order(&*self.order_repo, order_id).await?;
    let payment = Payment::new(...)?;
    let payment = order.apply_payment(payment)?;
    save_order(&*self.order_repo, &mut order).await?;
    Ok(payment)
}
```

### Use case method signature

```rust
pub async fn run(&self, order_id: &str) -> Result<(), ProcessOrderError> {
    let _ = self.order_service.find_by_id(order_id).await?;
    if self.guard.is_running() {
        return Err(ProcessOrderError::ProcessAlreadyRunning);
    }
    let scope = self.order_service.load_pending_line_items(order_id).await?;
    if scope.is_empty() {
        return Err(ProcessOrderError::NoLineItemsToProcess);
    }
    self.dispatch(scope);
    Ok(())
}
```

### Tauri command boundary

The use-case composite (or BC enum when no orchestration is needed) IS the FE-facing type. No mapper, no boundary type:

```rust
#[tauri::command]
#[specta::specta]
pub async fn process_order(
    uc: State<'_, ProcessOrderUseCase>,
    order_id: String,
) -> Result<(), ProcessOrderError> {
    uc.run(&order_id).await
}
```

### Frontend handling

The wire shape is a flat union of every variant. Narrow on `code`:

```ts
const result = await orderGateway.processOrder(orderId);
if (result.status === "error") {
  switch (result.error.code) {
    case "OrderNotFound": // wrapped from OrderError
    case "ProcessAlreadyRunning": // flat use-case variant
    case "NoLineItemsToProcess": // flat use-case variant
    case "DatabaseError": // wrapped from OrderError or InventoryError
    // ...
  }
}
```

---

## Contract presentation

`docs/contracts/{bc}-contract.md` describes the wire shape only.

- Per-command "Errors" column lists wire-visible variant codes (e.g. `ProcessAlreadyRunning (ORD-113)`).
- No `*ApplicationError`, `*DomainError`, composite type names — Rust internals are out of scope.
- Spec rule tags (`(ORD-043)`, `(B18)`) and short contextual prose (`(when reference missing)`) are encouraged; they help the FE author and don't leak Rust.
- No `## Changelog` section; git history is the changelog.

---

## Anti-patterns

- ❌ Per-BC `*ApplicationError` / `*DomainError` split — collapse into a single `{BC}Error`.
- ❌ Wrapping use-case-specific guards in their own leaf enum (`{UseCase}GuardError`) — keep them as flat variants in the composite.
- ❌ Documenting Rust-internal type names in the contract — wire shape only.
- ❌ Returning `anyhow::Result<T>` from a service or use-case method that surfaces to a Tauri command.
- ❌ Adding a `Database` / `Infrastructure` / `Unknown` variant carrying a `String` hint to the FE.
- ❌ `format!("{e:#}")` into a wire-visible payload.
- ❌ Re-declaring leaf variant codes inside a composite (the `#[from]` wrapper does the routing).
- ❌ Tuple variants on a `#[serde(tag = "code")]` enum — use struct variants.
- ❌ Two wrapper variants in a composite whose enums share a `code` discriminant (silent collision under `#[serde(untagged)]`; verify uniqueness when adding a wrapper).
- ❌ `panic!` / `unwrap` / `expect` in production paths. Tests only.
- ❌ Comments like `// Replaces the anyhow-era X` or `// Per the Y rule` (rationale-as-comment; doc what the code IS, not what it used to be).

---

## Where things live

| What                                          | Where                                                |
| --------------------------------------------- | ---------------------------------------------------- |
| Per-BC flat enum (`{BC}Error`)                | `src-tauri/src/context/{bc}/error.rs`                |
| Use-case composite + flat guards              | `src-tauri/src/use_cases/{name}/error.rs`            |
| All composites + BC enums on the FE wire      | `src/bindings.ts` (auto-generated; do not edit)      |
| Per-command wire variants                     | `docs/contracts/{bc}-contract.md`                    |
| Layering rules within a BC (domain / service) | [`docs/ddd-reference.md`](ddd-reference.md) § Errors |
| Backend coding rules (B31 in particular)      | [`docs/backend-rules.md`](backend-rules.md)          |
