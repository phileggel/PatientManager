# Testing Strategy

## Overview

| Tier                    | What                         | Location                                                     | Mocks?                        |
| ----------------------- | ---------------------------- | ------------------------------------------------------------ | ----------------------------- |
| Frontend                | Component and hook behavior  | colocated `*.test.ts(x)` next to the file                    | Gateway mocked                |
| BE Tier 1 — Unit        | Service / orchestrator logic | inline `#[cfg(test)] mod tests` in the same `.rs` file       | All deps mocked (mockall)     |
| BE Tier 2 — Repository  | SQL queries and persistence  | inline `#[cfg(test)] mod tests` in the repository `.rs` file | None — real in-memory SQLite  |
| BE Tier 3 — Integration | Spec-driven end-to-end flows | `src-tauri/tests/` (separate binary)                         | None — real services + SQLite |

Run checks before committing:

```bash
npm run test          # Frontend (Vitest)
cd src-tauri && cargo test  # Backend (Rust)
python3 scripts/check.py    # Full check: lint + type-check + tests
```

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
  getCashBankAccountId: vi.fn(),
}));

vi.mock("../manual_match/gateway", () => ({
  createFundTransfer: vi.fn(),
  createDirectTransfer: vi.fn(),
}));

vi.mock("@/core/snackbar", () => ({
  useSnackbar: () => ({ showSnackbar: vi.fn() }),
}));

// 2. Import mocked modules for typed access
import * as gateway from "../gateway";
import { useMyHook } from "./useMyHook";
```

For mocks that are referenced inside `beforeEach` or test bodies, use `vi.hoisted`:

```ts
const mockToastShow = vi.hoisted(() => vi.fn());

vi.mock("@/core/snackbar", () => ({
  toastService: { show: mockToastShow, subscribe: vi.fn(() => vi.fn()) },
}));
```

### Seeding Zustand store

Inject store state directly in `beforeEach`:

```ts
import { useAppStore } from "@/lib/appStore";

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({
    bankAccounts: [{ id: "acc-1", name: "Compte principal", iban: null }],
  });
});
```

### Testing hooks with renderHook

**CRITICAL — Stable references required.**

Never create objects or functions inside the `renderHook` callback. The callback runs on every render; inline factories produce a new reference each time. If that value is a `useEffect` dependency, the effect fires on every render → infinite loop → OOM crash.

```ts
// ❌ BAD — new object reference on every render → infinite loop
const { result } = renderHook(() => useMyHook(makeTransfer(), vi.fn()));

// ✅ GOOD — stable reference, effect fires once
const transfer = makeTransfer();
const onClose = vi.fn();
const { result } = renderHook(() => useMyHook(transfer, onClose));
```

### Async patterns

Use `waitFor` to wait for async state to settle, `act` to trigger synchronous actions:

```ts
it("loads linked groups on mount", async () => {
  vi.mocked(gateway.getTransferFundGroupIds).mockResolvedValue({
    success: true,
    data: ["group-1"],
  });

  const transfer = makeFundTransfer();
  const { result } = renderHook(() =>
    useEditBankTransferModal(transfer, vi.fn()),
  );

  // Wait for async effect to complete
  await waitFor(() =>
    expect(result.current.selectedGroupIds).toEqual(["group-1"]),
  );
});

it("clears selection when type changes", async () => {
  const { result } = renderHook(() => useAddBankTransferForm());

  await waitFor(() => expect(gateway.getCashBankAccountId).toHaveBeenCalled());

  // Trigger synchronous action
  act(() => result.current.handleTypeChange("CHECK"));

  expect(result.current.bankAccount).toBe("");
});
```

For testing race conditions (value resolves after a user action):

```ts
it("assigns value reactively when fetch resolves late", async () => {
  let resolve!: (v: { success: true; data: string }) => void;
  vi.mocked(gateway.getCashBankAccountId).mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );

  const { result } = renderHook(() => useAddBankTransferForm());

  act(() => result.current.handleTypeChange("CASH"));
  expect(result.current.bankAccount).toBe(""); // not yet resolved

  await act(async () =>
    resolve({ success: true, data: "cash-account-default" }),
  );

  expect(result.current.bankAccount).toBe("cash-account-default");
});
```

### Verifying gateway calls

Check that the correct command is called with the correct arguments:

```ts
expect(gateway.updateFundTransfer).toHaveBeenCalledWith(
  "transfer-fund-1",
  "2026-03-10",
  ["group-1"],
);
expect(gateway.updateDirectTransfer).not.toHaveBeenCalled();
```

---

## Backend Testing (Rust)

Three distinct tiers, each with a clear purpose and location.

---

### Tier 1 — Unit tests (mock dependencies)

**Location:** inline `#[cfg(test)] mod tests { ... }` at the bottom of service and orchestrator files.

**Purpose:** Test business logic in isolation. Every external dependency is mocked.

**Use mockall** (`#[cfg_attr(test, mockall::automock)]` on the trait):

```rust
#[tokio::test]
async fn test_create_transfer_success() {
    let mut repo = MockBankTransferRepository::new();
    repo.expect_create_transfer()
        .returning(|date, amount, kind, account| {
            BankTransfer::new(date, amount, kind, account)
        });

    let service = BankTransferService::new(Arc::new(repo));
    let account = BankAccount::new("Main account".to_string(), None).unwrap();
    let result = service
        .create_transfer("2026-03-10".to_string(), 150000, BankTransferType::Fund, account)
        .await;

    assert!(result.is_ok());
    assert_eq!(result.unwrap().amount, 150000);
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
        SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(opts)
            .await
            .unwrap()
            .tap_mut(|p| sqlx::migrate!("./migrations").run(p))
    }

    #[tokio::test]
    async fn test_create_and_read_fund() {
        let pool = make_pool().await;
        let repo = SqliteFundRepository::new(pool);
        let fund = repo.create_fund("75", "CPAM 75").await.unwrap();
        let found = repo.read_fund(&fund.id).await.unwrap().unwrap();
        assert_eq!(found.fund_identifier, "75");
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
// tests/fund_payment_reconciliation.rs
struct Ctx {
    orchestrator: FundPaymentReconciliationOrchestrator,
    fund_payment_service: Arc<FundPaymentService>,  // held separately for post-action assertions
}

async fn build_ctx() -> Ctx {
    let pool = make_pool().await;
    let fund_payment_repo = Arc::new(SqliteFundPaymentRepository::new(pool.clone()));
    let fund_payment_service = Arc::new(FundPaymentService::new(fund_payment_repo.clone()));
    let orchestrator = FundPaymentReconciliationOrchestrator::new(
        fund_payment_service.clone(),
        // ... other services
    );
    Ctx { orchestrator, fund_payment_service }
}
```

**What to test:**

- Multi-service flows: procedure reconciliation, group creation, status transitions
- Spec business rules: locked groups rejected, overpayment reset paths
- Cross-context interactions that can't be exercised by a single unit test

**Key constraint:** `tests/` can only access public API. Keep a separate `Arc<Service>` in the `Ctx` struct when you need to assert post-action state — do not access private fields.

---

### What not to test (all tiers)

- A constructor doesn't panic
- An empty input returns empty output (no logic traversed)
- A getter returns what was just passed in
- A test helper disguised as a test

---

### Running backend tests

```bash
cd src-tauri
cargo test                     # All tests
cargo test bank_transfer        # Filter by name
cargo test -- --nocapture      # Show println! output
RUST_BACKTRACE=1 cargo test    # With backtraces
```
