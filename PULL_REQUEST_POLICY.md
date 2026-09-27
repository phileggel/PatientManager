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

The harness is the gate (`docs/workflow.md` § 5): `just harness` runs it locally, and
every check in `required-checks.json` must be green on the pull request. Commits follow
the [Commit Policy](./COMMIT_POLICY.md). **Never bypass a hook** with `--no-verify`.

## Workflow

The full loop is `docs/workflow.md` § 3. In short: a `<type>/<slug>` branch off a fresh
`main`, one commit (later fixes as `fixup!` commits), the PR opened for the record, and
`just merge` once every check is green — it folds the fixups, fast-forwards `main` and
deletes the branch. No pull request waits for a human approval; the design gate comes
before the work, not at the PR.

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
