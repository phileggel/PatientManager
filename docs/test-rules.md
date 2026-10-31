# Testing Strategy

## Overview

| Tier                    | What                         | Location                                                     | Mocks?                        |
| ----------------------- | ---------------------------- | ------------------------------------------------------------ | ----------------------------- |
| Frontend                | Component and hook behavior  | colocated `*.test.ts(x)` next to the file                    | Gateway mocked                |
| BE Tier 1 — Unit        | Service / orchestrator logic | inline `#[cfg(test)] mod tests` in the same `.rs` file       | All deps mocked (mockall)     |
| BE Tier 2 — Repository  | SQL queries and persistence  | inline `#[cfg(test)] mod tests` in the repository `.rs` file | None — real in-memory SQLite  |
| BE Tier 3 — Integration | Spec-driven end-to-end flows | `src-tauri/tests/` (separate binary)                         | None — real services + SQLite |
| Tier 4 — E2E            | WebDriver UI flows           | `e2e-rules.md` (ephemeral DB, B36)                           | None                          |

Nothing is run by hand before a commit: the hooks run the fast checks, the tests are CI's
(`docs/workflow.md` § 5); `just harness --coverage` runs CI's gate locally. One test while working takes the runner's filter, which no recipe has:
`npx vitest run <path>`, or `cargo test <filter>` in `src-tauri/`.

---

## Frontend Testing (Vitest + React Testing Library)

### What to test

Test **behavior**, not implementation:

- State transitions triggered by user actions (auto-fill, reset after submit, type switching)
- Gateway call arguments — correct command, correct params, correct order
- Success and error handling — snackbar shown, form reset, modal closed
- Async flows — loading, race conditions, late-resolving promises

Do **not** write tests for:

- Rendering / DOM structure only
- Trivial getters or constructors

### Mocking gateway modules

Always mock at the **module level** with `vi.mock`, before importing the hook under test. Use `vi.hoisted` for mocks that need to be referenced in setup callbacks.

```ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// 1. Mock gateway modules before importing the hook
vi.mock("../gateway", () => ({
  fetchItems: vi.fn(),
}));

vi.mock("@/ui/components/snackbar/snackbarStore", () => ({
  useSnackbar: () => ({ showSnackbar: vi.fn() }),
}));

// 2. Import mocked modules for typed access
import * as gateway from "../gateway";
import { useMyHook } from "./useMyHook";
```

For mocks that are referenced inside `beforeEach` or test bodies, use `vi.hoisted`:

```ts
const mockToastShow = vi.hoisted(() => vi.fn());

vi.mock("@/ui/components/snackbar/snackbarStore", () => ({
  toastService: { show: mockToastShow, subscribe: vi.fn(() => vi.fn()) },
}));
```

### Seeding Zustand store

Inject store state directly in `beforeEach`:

```ts
import { useCacheStore } from "@/infra/cache/store";

beforeEach(() => {
  vi.clearAllMocks();
  useCacheStore.setState({
    items: [{ id: "item-1", name: "Example item" }],
  });
});
```

### Testing hooks with renderHook — stable references (F19)

```ts
// ❌ BAD — new object reference on every render → infinite loop
const { result } = renderHook(() => useMyHook(makeItem(), vi.fn()));

// ✅ GOOD — stable reference, effect fires once
const item = makeItem();
const onClose = vi.fn();
const { result } = renderHook(() => useMyHook(item, onClose));
```

### Async patterns

Use `waitFor` to wait for async state to settle, `act` to trigger synchronous actions:

```ts
it("loads data on mount", async () => {
  vi.mocked(gateway.fetchItems).mockResolvedValue({
    status: "ok",
    data: ["item-1"],
  });

  const item = makeItem();
  const { result } = renderHook(() => useMyHook(item, vi.fn()));

  await waitFor(() => expect(result.current.items).toEqual(["item-1"]));
});

it("resets state when type changes", async () => {
  const { result } = renderHook(() => useMyForm());

  await waitFor(() => expect(gateway.fetchItems).toHaveBeenCalled());

  act(() => result.current.handleTypeChange("OTHER"));

  expect(result.current.selectedItem).toBe("");
});
```

For testing race conditions (value resolves after a user action):

```ts
it("assigns value reactively when fetch resolves late", async () => {
  let resolve!: (v: { status: "ok"; data: string }) => void;
  vi.mocked(gateway.fetchItems).mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );

  const { result } = renderHook(() => useMyForm());

  act(() => result.current.handleTypeChange("OTHER"));
  expect(result.current.selectedItem).toBe(""); // not yet resolved

  await act(async () => resolve({ status: "ok", data: "default-item" }));

  expect(result.current.selectedItem).toBe("default-item");
});
```

### Verifying gateway calls

Check that the correct command is called with the correct arguments:

```ts
expect(gateway.updateItem).toHaveBeenCalledWith("item-id-1", "2026-03-10", [
  "group-1",
]);
expect(gateway.deleteItem).not.toHaveBeenCalled();
```

---

## Backend Testing (Rust)

### Tier 1 — Unit tests (mock dependencies)

**Location:** inline `#[cfg(test)] mod tests { ... }` at the bottom of service and orchestrator files.

**Purpose:** Test business logic in isolation. Every external dependency is mocked.

**Use mockall** (`#[cfg_attr(test, mockall::automock)]` on the trait):

```rust
#[tokio::test]
async fn test_create_item_success() {
    let mut repo = MockItemRepository::new();
    repo.expect_create()
        .returning(|name, value| {
            Item::new(name, value)
        });

    let service = ItemService::new(Arc::new(repo));
    let result = service.create("example".to_string(), 100).await;

    assert!(result.is_ok());
    assert_eq!(result.unwrap().value, 100);
}
```

**What to test:**

- Service logic: correct values returned, correct state transitions
- Error propagation: repository failures bubble up correctly
- Domain factory methods: validation rules enforced (`new()`, `with_id()`)
- Orchestrator flows: correct sequence of service calls, correct field values set

---

### Tier 2 — Repository tests (real SQLite)

**Location:** inline `#[cfg(test)] mod tests { ... }` at the bottom of repository files.

**Purpose:** Verify SQL queries and persistence behavior. No mocking — uses a real in-memory `SqlitePool` with migrations applied.

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

    async fn make_pool() -> SqlitePool {
        let opts = SqliteConnectOptions::new().in_memory(true).foreign_keys(false);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(opts)
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn test_create_and_read_item() {
        let pool = make_pool().await;
        let repo = SqliteItemRepository::new(pool);
        let item = repo.create("example", 100).await.unwrap();
        let found = repo.find_by_id(&item.id).await.unwrap().unwrap();
        assert_eq!(found.name, "example");
    }
}
```

**What to test:**

- CRUD correctness: insert → read round-trip
- Constraint enforcement: duplicate key, foreign key
- Query filters: find-by-X returns correct rows
- Soft-delete behavior: deleted rows excluded from reads

---

### Tier 3 — Integration / spec tests (full flow)

**Location:** `src-tauri/tests/` directory (separate Rust test binary — only public API visible).

**Purpose:** Validate spec-driven orchestrator flows end-to-end across multiple services and repositories. No mocking — real services backed by real in-memory SQLite.

```rust
struct Ctx {
    orchestrator: MyOrchestrator,
    item_service: Arc<ItemService>,  // held separately for post-action assertions
}

async fn build_ctx() -> Ctx {
    let pool = make_pool().await;
    let item_repo = Arc::new(SqliteItemRepository::new(pool.clone()));
    let item_service = Arc::new(ItemService::new(item_repo.clone()));
    let orchestrator = MyOrchestrator::new(item_service.clone());
    Ctx { orchestrator, item_service }
}
```

**What to test:**

- Multi-service flows: orchestrated operations across multiple BCs
- Spec business rules: invariants enforced across the full stack
- Cross-context interactions that can't be exercised by a single unit test

**Key constraint:** `tests/` can only access public API. Keep a separate `Arc<Service>` in the `Ctx` struct when you need to assert post-action state — do not access private fields.

---

### Tier 4 — E2E

`e2e/`, the full app through WebDriver on an ephemeral database (B36): [`e2e-rules.md`](e2e-rules.md).

### What not to test (all tiers)

B33's trivial tests: a constructor that does not panic, an empty input returning an empty
output, a getter returning what it was given, a helper disguised as a test.
