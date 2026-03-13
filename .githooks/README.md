# Git Hooks Setup

This directory contains git hooks that enforce code quality standards.

## Available Hooks

### commit-msg
- **Purpose:** Validate commit message format and policy compliance
- **Validates:**
  - Conventional commit format (`type: description`)
  - Valid types: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`
  - Title under 72 characters
  - No co-author lines (not allowed per COMMIT_POLICY.md)
  - No test results in commit messages (those go in PRs)
  - Proper lowercase and no periods in title
- **Action:** Rejects commit if message violates COMMIT_POLICY.md

### pre-commit
- **Purpose:** Prevent commits that fail quality checks
- **Runs:** `./scripts/check.sh`
- **Action:** Rejects commit if any tests or linting fail

## Setup Instructions

### One-time Setup

Configure git to use the hooks directory:

```bash
git config core.hooksPath .githooks
```

Or globally (for all repos):

```bash
git config --global core.hooksPath .githooks
```

### Verify Setup

```bash
# Check that hooks are configured
git config core.hooksPath
# Should output: .githooks
```

### Test the Hook

Try making a commit while a check fails (e.g., add a console.log). The commit will be rejected.

## Bypass Hooks (Not Recommended)

If you absolutely need to bypass hooks:

```bash
git commit --no-verify
```

## Hook Behavior

When you run `git commit`:

1. **commit-msg hook runs** → Validates message format and policy
   - Message invalid? → Commit rejected ❌
   - Message valid? → Continue to next hook

2. **pre-commit hook runs** → `./scripts/check.sh` (tests, linting, formatting)
   - Any checks fail? → Commit rejected ❌
   - All checks pass? → Commit succeeds ✅

### If Rejected by commit-msg

- Fix the commit message (see error output)
- Re-run `git commit` with corrected message

### If Rejected by pre-commit

- Fix the issues (see error output)
- Run `./scripts/check.sh --verbose` for details
- Re-run `git commit`

## Disabling Hooks Temporarily

```bash
# Run check script manually first
./scripts/check.sh

# Then commit
git commit --no-verify
```

But this defeats the purpose! Hooks exist to maintain quality standards.
