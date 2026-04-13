---
name: smart-commit
description: Create conventional commits in production context with strict validation, tests, linters, and confirmation.
tools: Bash, AskUserQuestion
---

# Skill — `smart-commit`

Create **conventional commits** in a production context.
This skill enforces **tests, linters, commit conventions, and safety checks**.

All commits must pass before being accepted.

---

## Execution Steps

### 1. Show current changes

git status --short

### 2. Check for sensitive files (mandatory)

git status --porcelain | grep -E '\.(env|key|pem|secret|password)$|credentials'

- If found: warn and **stop** commit
- User must remove sensitive files before proceeding

### 3. Run tests and linters (mandatory)

```bash
python3 scripts/check.py
```

- If any check fails: stop, report the failure, do not proceed to commit

### 4. Suggest commit type and draft message

Based on changed files, recommend:

- feat — new functionality
- fix — bug fix
- docs — documentation only
- test — tests only
- chore — tooling/config/deps
- refactor — restructuring
- ci — CI/CD and workflow changes

**Draft a suggested commit title** (imperative, English) and compute its character count. Display it as:

> Suggested: `feat: add payment gateway` (27 chars)

This lets the user see the length constraint before answering, avoiding a back-and-forth correction loop.

### 5. Ask user for commit details

Use **AskUserQuestion** to get:

1. Commit type (mandatory, default to suggested)
2. Optional scope (e.g. `domain`, `feature`, `ci`) — leave blank for no scope
3. Commit message (imperative, **English**, ≤72 characters) — pre-populate with the suggested title from step 4 (including its char count) so the user can accept or adjust inline without a back-and-forth correction loop
4. Commit body (optional, **English**, max 5 lines; include context, references to tasks)

### 6. Validate message format

- Commit type must be one of: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`, `ci`
- Title ≤72 chars, body ≤5 lines
- If non-compliant: return to step 5 and prompt the user to correct the message

### 7. Confirm before committing

Display the full formatted commit title (and body if provided) and ask the user to confirm:

> Ready to commit: `type(scope): message`
> Proceed?

Use **AskUserQuestion** with a Yes / Cancel option. If the user cancels, stop and do not commit.

### 8. Create commit

Stage only the relevant files identified in step 1 (never use `git add -A` — it can accidentally include sensitive or unintended files):

```bash
git add <file1> <file2> ...
# Without scope:
git commit -m "feat: add payment gateway"
# With scope:
git commit -m "feat(billing): add payment gateway"
```

Format: `type: message` (no scope) or `type(scope): message` (with optional scope).

### 9. Show result

git log -1 --oneline

---

## Critical Rules

1. Never commit sensitive files
2. All tests must pass (`python3 scripts/check.py`) before committing
3. All linters must pass
4. Commit message must be in **English** and follow conventional format: `type: message` or `type(scope): message`
5. Never use `git add -A` — stage files explicitly by name
6. User confirmation required before commit
7. No bypassing rules in production

---

## Notes

- Ensures traceability, safety, and maintainability
- Designed for production: correctness over speed
