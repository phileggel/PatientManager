# PROD Skill — `smart-commit`

Create **conventional commits** in a production context.
This skill enforces **tests, linters, commit conventions, and safety checks**.

All commits must pass before being accepted.

---

## Skill Definition

---
name: smart-commit
description: Create conventional commits in production context with strict validation, tests, linters, and confirmation.
---

---

## Execution Steps

### 1. Show current changes

git status --short

### 2. Check for sensitive files (mandatory)

git status --porcelain | grep -E '\.(env|key|pem|secret|password)$|credentials'

- If found: warn and **stop** commit
- User must remove sensitive files before proceeding

### 3. Suggest commit type

Based on changed files, recommend:

- feat — new functionality
- fix — bug fix
- docs — documentation only
- test — tests only
- chore — tooling/config/deps
- refactor — restructuring

**Provide a short, clear rationale**, no verbose explanation.

### 4. Ask user for commit details

Use **AskUserQuestion** to get:

1. Commit type (mandatory, default to suggested)
2. Commit message (imperative, ≤72 characters)
3. Commit body (optional, max 5 lines; include context, references to tasks/tests)

### 5. Validate message format

- Title ≤72 chars, body ≤5 lines
- Block commit if not compliant

### 6. Create commit

git add -A && git commit -m "<type>: <message>"

Note: Ensure the format is strictly "<type>: <message>" without parentheses.

### 7. Show result

git log -1 --oneline

---

## Critical Rules

1. Never commit sensitive files  
2. All tests must pass  
3. All linters must pass  
4. Commit message must follow conventional format  
5. No scopes allowed: Do not use `type(scope):`, only `type:`
6. User confirmation required before commit  
7. Commits must reference todo items and scope  
8. No bypassing rules in production

---

## Notes

- Integrates with `start-task` for strict workflow  
- Ensures traceability, safety, and maintainability  
- Designed for production: correctness
