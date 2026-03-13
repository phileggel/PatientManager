# Testing Strategy

## Overview

All code changes should include tests. Use unit tests for logic, integration tests for Tauri commands, and E2E tests for critical flows.

## Frontend Testing (React + Vite)

**Test runner**: Vitest (configured with Vite)

```bash
npm test              # Run tests
npm test -- --ui     # UI mode with browser interface
npm run coverage      # Coverage report
```

**Best Practices**:
- Test behavior, not implementation
- Use React Testing Library for component tests
- Keep tests close to how users interact with components
- Mock Tauri `invoke` calls using `vi.mock()`
- Aim for 80%+ coverage on critical components

**Example**:
```javascript
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import App from './App';

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve({
    message: 'Hello',
    status: 'success',
    timestamp: '123456'
  }))
}));

test('displays backend response', async () => {
  render(<App />);

  // Wait for the component to fetch and display
  const message = await screen.findByText(/Hello/);
  expect(message).toBeInTheDocument();
});
```

## Backend Testing (Rust + Tauri)

**Test framework**: Rust's built-in `#[test]` or testing libraries like `#[cfg(test)]`

```bash
cd src-tauri
cargo test                    # Run all tests
cargo test say_hello          # Run specific test
cargo test -- --nocapture    # Show println! output
```

**Best Practices**:
- Unit test command logic
- Test return types and serialization
- Mock any external dependencies
- Keep tests isolated and deterministic
- Aim for 80%+ coverage on critical commands

**Example**:
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_say_hello_returns_success() {
        let result = say_hello();

        assert_eq!(result.status, "success");
        assert!(result.message.contains("Hello"));
        assert!(!result.timestamp.is_empty());
    }

    #[test]
    fn test_check_health_returns_ok() {
        let result = check_health();

        assert_eq!(result.status, "OK");
    }
}
```

## Integration Testing (Tauri Commands)

Test that Rust commands are properly registered and callable:

```bash
# Run Tauri in test mode
npm run tauri:dev

# In another terminal, test the commands
curl -X POST http://localhost:8080/invoke \
  -H "Content-Type: application/json" \
  -d '{"cmd":"say_hello"}'
```

Or use JavaScript to test:

```javascript
import { invoke } from '@tauri-apps/api/core'

test('say_hello command works', async () => {
  const response = await invoke('say_hello');

  expect(response.status).toBe('success');
  expect(response.message).toContain('Tauri');
  expect(response.timestamp).toBeTruthy();
});
```

## Running Tests Locally

```bash
# React/JavaScript tests
npm test

# Rust tests
cd src-tauri
cargo test

# All tests
npm test && cd src-tauri && cargo test
```

## Coverage Expectations

- **Critical business logic**: 90%+
- **Core features**: 80%+
- **UI components**: 70%+
- **Utilities**: 100%

## Before Committing

1. All React tests pass: `npm test`
2. All Rust tests pass: `cd src-tauri && cargo test`
3. No console errors or warnings
4. Coverage maintained or improved
5. Code follows project conventions in `VERSIONING.md`

## Development Workflow

1. Start development server: `npm run tauri:dev`
2. Make changes to React components or Rust commands
3. Automatic reload will trigger tests
4. Fix any failing tests
5. Verify with manual testing in the app
6. Commit with conventional commits

## Testing Best Practices

### React Components
- Test user interactions (clicks, inputs)
- Don't test implementation details
- Mock Tauri API calls
- Test loading/error/success states
- Use `screen` queries, not `container`

### Rust Commands
- Test return values
- Verify serialization to JSON
- Test error cases
- Keep tests pure (no side effects)
- Use assertions for clarity

## Debugging Tests

### React Tests
```bash
# Run tests in UI mode
npm test -- --ui

# Run single test file
npm test App.test.jsx

# Watch mode
npm test -- --watch
```

### Rust Tests
```bash
# Show test output
cargo test -- --nocapture

# Run single test
cargo test test_say_hello

# Show backtraces
RUST_BACKTRACE=1 cargo test
```

## References

- [Versioning & Commit Strategy](VERSIONING.md)
- [Agent Operating Rules](../AGENTS.md)
- [Tauri Testing Documentation](https://tauri.app/en/guides/testing/)
- [Vitest Documentation](https://vitest.dev/)
- [Rust Testing Guide](https://doc.rust-lang.org/book/ch11-00-testing.html)
