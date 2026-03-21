# Testing Strategy

## Overview

Tests live **colocated** with the code they test:
- Frontend: `use{Feature}.test.ts` or `{Feature}.test.tsx` next to the file under test
- Backend: `#[cfg(test)] mod tests { ... }` inline at the bottom of the `.rs` file

Run checks before committing:
```bash
npm run test          # Frontend (Vitest)
cd src-tauri && cargo test  # Backend (Rust)
./scripts/check.sh    # Full check: lint + type-check + tests
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
    bankAccounts: [
      { id: "acc-1", name: "Compte principal", iban: null },
    ],
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
  const { result } = renderHook(() => useEditBankTransferModal(transfer, vi.fn()));

  // Wait for async effect to complete
  await waitFor(() => expect(result.current.selectedGroupIds).toEqual(["group-1"]));
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
    new Promise((r) => { resolve = r; }),
  );

  const { result } = renderHook(() => useAddBankTransferForm());

  act(() => result.current.handleTypeChange("CASH"));
  expect(result.current.bankAccount).toBe(""); // not yet resolved

  await act(async () => resolve({ success: true, data: "cash-account-default" }));

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

### Structure

Tests live inline at the bottom of the file under test, inside `#[cfg(test)] mod tests`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use anyhow::anyhow;

    // Mock the repository trait
    struct MockBankTransferRepository {
        should_fail: bool,
    }

    #[async_trait::async_trait]
    impl BankTransferRepository for MockBankTransferRepository {
        async fn create_transfer(
            &self,
            transfer_date: String,
            amount: i64,
            transfer_type: BankTransferType,
            bank_account: BankAccount,
        ) -> anyhow::Result<BankTransfer> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            BankTransfer::new(transfer_date, amount, transfer_type, bank_account)
        }
        // ... other trait methods
    }

    #[tokio::test]
    async fn test_create_transfer_success() {
        let repo = Arc::new(MockBankTransferRepository { should_fail: false });
        let service = BankTransferService::new(repo);

        let account = BankAccount::new("Main account".to_string(), None).unwrap();
        let result = service
            .create_transfer("2026-03-10".to_string(), 150000, BankTransferType::Fund, account)
            .await;

        assert!(result.is_ok());
        let transfer = result.unwrap();
        assert_eq!(transfer.amount, 150000);
    }

    #[tokio::test]
    async fn test_create_transfer_repository_failure() {
        let repo = Arc::new(MockBankTransferRepository { should_fail: true });
        let service = BankTransferService::new(repo);

        let account = BankAccount::new("Main account".to_string(), None).unwrap();
        let result = service
            .create_transfer("2026-03-10".to_string(), 150000, BankTransferType::Fund, account)
            .await;

        assert!(result.is_err());
    }
}
```

### What to test

- Service logic: correct values returned, correct state transitions
- Error propagation: repository failures bubble up correctly
- Domain factory methods: validation rules enforced (`new()`, `with_id()`)
- Orchestrator flows: correct sequence of service calls, correct field values set

### What not to test (trivial tests)

- A constructor doesn't panic
- An empty input returns empty output (no logic traversed)
- A getter returns what was just passed in
- A test helper disguised as a test

### Running backend tests

```bash
cd src-tauri
cargo test                     # All tests
cargo test bank_transfer        # Filter by name
cargo test -- --nocapture      # Show println! output
RUST_BACKTRACE=1 cargo test    # With backtraces
```
