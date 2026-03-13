# Pull Request Policy

## Branch Strategy

**All work MUST be done on dedicated feature branches, never directly on `main`.**

Branch naming:
- `feature/*` - New features
- `fix/*` - Bug fixes
- `refactor/*` - Code refactoring
- `docs/*` - Documentation
- `test/*` - Tests

```bash
# ✅ Correct
git checkout -b feature/my-feature
git push -u origin feature/my-feature
gh pr create

# ❌ Wrong
git commit -m "feat: ..." # on main branch
```

## PR Description Format

Every PR description must contain **3 sections in English**:

### 1. Objective
One or two sentences stating what the PR accomplishes.

### 2. Feature
User-facing description without technical details.

**Focus on:**
- What the user can do
- How it helps solve the problem

**Avoid:**
- Implementation details
- File paths or function names
- Technical architecture

### 3. Tests
Test report showing all checks pass:
```
✅ X React tests (all passing)
✅ X Rust tests (all passing)
✅ Build successful
✅ Linters OK
```

## Quality Requirements

Before creating a PR, ensure:
1. All tests pass (`npm run test`, `cargo test`)
2. Linters pass (`npm run lint`, `cargo clippy`)
3. Build succeeds (`npm run build`)
4. Follow [Commit Policy](./COMMIT_POLICY.md)

**Do not bypass pre-push hook** with `--no-verify`.

## Workflow

1. Create feature branch
2. Make commits following commit policy
3. Push branch
4. Create PR with 3-section description
5. Ensure CI checks pass
6. Merge when approved (squash merge preferred)
7. Delete feature branch

## Example

**Title:** Feature: PDF Payment Reconciliation

**Description:**
```
## Objective

Enable reconciliation of PDF payments with database procedures and detect anomalies.

## Feature

**Automatic Reconciliation:**
- Compare PDF lines with database using social security number
- ±3 days tolerance on dates to handle processing delays

**Anomaly Detection:**
- Detect different fund between PDF and database
- Detect different amounts (€1 tolerance)

**Results Display:**
- Grouped by patient for easy review
- Separate tabs for matched, anomalies, and not found

## Tests

✅ 110 React tests (all passing)
✅ 50 Rust tests (all passing)
✅ Build successful
✅ Linters OK
```

## Related Documents

- [Commit Policy](./COMMIT_POLICY.md)
- [Testing Guide](./TESTING.md)
- [Architecture Guide](./ARCHITECTURE.md)
