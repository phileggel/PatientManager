# PROD Skill — `start-task`

Initialize a new task in a **production context** with strict enforcement.
This skill prioritizes **consistency, safety, and traceability**.

Feature branches are **mandatory**, commits are validated, and PR is required.

---

## Skill Definition

---
name: start-task
description: Initialize a production task by gathering context and creating a strict feature branch with required PR and todo list.
---

---

## Execution Steps

### 1. Ensure you are on `main`

git checkout main

### 2. Pull latest changes

git pull origin main

### 3. Collect task details **mandatory**

Use **AskUserQuestion** to collect:

- **Task type**: feat, fix, docs, test, chore, refactor
- **Short task description** (imperative sentence)

> All fields must be completed for prod.

### 4. Generate branch name **mandatory**

Format:

type/scope-short-description

Examples:
- feat/video/room-ui
- fix/backend/token-generation
- chore/infrastructure/docker-compose
- refactor/api/user-service

Rules:
- lowercase only
- hyphens for word separation
- concise and descriptive
- max 50 characters after type/scope

### 5. Create feature branch **mandatory**

git checkout -b <type>/<scope>-<description>

### 6. Confirm active branch

git branch --show-current

### 7. Create todo list **optional**

- Must include **3–5 steps**, each with:
  - description
  - status (todo / in_progress / done)
- Examples:
  - setup infra (todo)
  - implement API endpoint (todo)
  - connect frontend (todo)
- Display list to user
- First step marked **in_progress**

### 8. Start implementation

- Work on the branch
- All commits must use **`smart-commit`**
- Tests and linters must pass before commit

### 9. Pull Request creation **mandatory**

- User must create a PR to `main` before merge
- PR title: `<type>(<scope>): <short description>`
- PR body: **concise description**, testing results, impact analysis
- PR body: don't list all changes, **focus on what**, not on how.
- Include references to todo items completed

### 10. Request user PR approval.

- **AskUserQuestion** PR is approved or a change is needed?
- If an update is needed:
  - not in the current scope (AskUserQuestion if unsure): create a new commit
  - in the current scope: ammend the previous commit and adapt its description
- PR must be approved before starting a new task

---

## Critical Rules

1. Feature branch **mandatory**  
2. PR **mandatory** before merge  
3. Branch names must follow strict convention  
4. No work directly on `main`  

---

## Notes

- Integrates with `smart-commit` for validated commits  
- Designed for production workflow: safety > speed  
- Traceability: all tasks, commits, and PRs are tracked
