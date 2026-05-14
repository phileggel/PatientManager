---
name: start
description: Use at the start of a new task to lock in workflow (Full vs Simple), create a feature branch, and emit the session's working context. Invoked as `/start [fix|chore|test|feature|refactor]` where the scope argument pre-selects a workflow. Not for mid-session triage of in-flight work — use `whats-next` instead.
tools: AskUserQuestion, Bash
---

# Skill — `start`

Invocation: `/start [fix|chore|test|feature|refactor]`

---

## Required tools

`AskUserQuestion`, `Bash`.

---

## When to use

- **At the start of a new task** — before any code is written, to lock in workflow + branch + working context
- **When picking up a fresh feature or fix** — establishes the session contract the main agent will follow
- **When the scope is known up front** — pass it as the argument (`/start fix`) to skip one prompt

Not for mid-session triage of in-flight work — use `/whats-next` instead. Not for exploring what the kit ships — use `/kit-discover` instead.

---

## Critical Rules

- **Never proceed on `main`.** Step 3 enforces a feature branch before the working context is emitted; the rest of the workflow assumes branch scope.
- **The Working Context block is the session contract.** Once emitted, the main agent treats it as the authoritative checklist for the rest of the session — do not silently deviate.
- **Workflow switching is always allowed.** The scope-suggested workflow in Step 1 is a default, not a lock; the user can override at Q2 or any later point.

---

## Execution Steps

### Step 1 — Determine workflow suggestion from scope

| Scope      | Suggestion                |
| ---------- | ------------------------- |
| `feature`  | A — Full Feature Workflow |
| `refactor` | ask — could go either way |
| `fix`      | B — Simple Workflow       |
| `chore`    | B — Simple Workflow       |
| `test`     | B — Simple Workflow       |
| (none)     | ask                       |

If the scope argument is not in the table above (e.g. `/start hotfix`), treat it as `(none)` and fall through to `ask`. Do not reject the invocation.

### Step 2 — Ask the user

Use **AskUserQuestion** to collect two things in one call:

**Q1 — Task description**: "What needs to be done?" (one sentence, free text)

**Q2 — Workflow**: show both options; pre-select the suggested one (mark as Recommended if a suggestion exists):

- `A — Full workflow` — new feature, business logic, contract changes, significant refactor
- `B — Simple workflow` — bug fix, chore, tests, maintenance, no new business rules

If the user cancels Q1 or Q2, abort the skill — do not emit a partial Working Context.

### Step 3 — Check branch before outputting context

Before outputting anything, run `git branch --show-current` to check the current branch.

- If on `main`: use **AskUserQuestion** to ask for a branch name, then validate it matches `^(feat|fix|chore|test|refactor|docs|ci)/[a-z0-9][a-z0-9-]*$` before running `git checkout -b {branch}`. If validation fails, ask again. Do not proceed until the branch is created.
- If already on a feature branch: proceed.

### Step 4 — Output working context

Emit the working context per the **Output format** section below, immediately after the branch check. This block is the main agent's session context — it drives the rest of the work.

---

## Output format

Pick the template matching the chosen workflow. Replace `{task}` with the user's description, `{type}` with the scope argument or `unspecified`, and `{branch}` with the current branch name from `git branch --show-current`.

### If Workflow A:

```
## Working Context

**Task**: {task}
**Type**: {type}
**Branch**: {branch}
**Workflow**: A — Full Feature Workflow

### Phase 1 — Spec & Contract & Plan _(main agent: opus)_
- [ ] `/spec-writer` → `docs/spec/{feature}.md`
- [ ] `spec-reviewer` → validate spec quality [soft gate — hard if 🔴]
- [ ] `/contract` → `docs/contracts/{domain}-contract.md` [human approves shape]
- [ ] `contract-reviewer` → validate contract vs spec [soft gate — hard if 🔴]
- [ ] `feature-planner` → `docs/plan/{feature}-plan.md`
- [ ] `plan-reviewer` → validate plan vs spec + contract [soft gate — hard if 🔴]
- [ ] **🔀 Switch model** — use **AskUserQuestion** to pause and ask the user to run `/model sonnet` before Phase 2. Phases 2–3 are mechanical execution against locked artifacts; sonnet is the right model. Do NOT proceed until the user confirms the switch is done. Switch back to `opus` later only if a reviewer surfaces a design-level finding that requires re-planning.

### Phase 2 — Backend _(main agent: sonnet)_
- [ ] Database migration (`just migrate` + `just prepare-sqlx`) _(if schema changes per plan)_
- [ ] `test-writer-backend` → Rust stubs from contract, confirm red
- [ ] Implement backend (make tests green)
- [ ] `just format`
- [ ] `reviewer-backend` → fix issues
- [ ] `just generate-types` → updates `src/bindings.ts`
- [ ] Fix TS compilation errors from new bindings only — no UI work
- [ ] `just check` — TypeScript clean
- [ ] `/smart-commit`: backend layer [HARD GATE]
- [ ] `/create-pr` if the **PR Plan** section of `docs/plan/{feature}-plan.md` slices BE into its own PR; otherwise continue. After merge, branch the next phase off updated `main`.

### Phase 3 — Frontend _(main agent: sonnet)_
- [ ] `test-writer-frontend` → Vitest stubs from contract, confirm red
- [ ] Implement frontend (make tests green)
- [ ] `just format`
- [ ] `/visual-proof` → capture final state; stage screenshots before commit _(if .tsx/.css changed)_
- [ ] `reviewer-frontend` → fix issues (Parts A + B + C)
- [ ] `/smart-commit`: frontend layer [HARD GATE]
- [ ] `/create-pr` if the **PR Plan** slices FE into its own PR; otherwise continue. After merge, branch the next phase off updated `main`.

### Phase 4 — Review & Closure _(main agent: sonnet — switch back to opus only if a reviewer surfaces a design-level finding)_
- [ ] `test-writer-e2e` → produces pyramid-friendly E2E scenarios from contract (run `/setup-e2e` first if not done)
- [ ] Run `npm run test:e2e` → green confirmed (main agent triages any failure)
- [ ] `reviewer-e2e` _(reviews E2E test files)_
- [ ] `/smart-commit`: E2E layer [HARD GATE]
- [ ] `reviewer-arch` (always) + `reviewer-sql` (if migrations) + `reviewer-infra` (if any config, script, hook, or workflow file changed) + `reviewer-security` _(if Tauri command, capability, or security-sensitive file modified)_
- [ ] Update `ARCHITECTURE.md` + `docs/todo.md`
- [ ] `spec-checker` → all rules and contract commands covered
- [ ] `/smart-commit`: tests & docs [HARD GATE]
- [ ] `/create-pr` → final PR per the **PR Plan** (or merge directly: `git checkout main && git merge --no-ff feat/{name}`)
```

> **Reading the PR Plan**: after `feature-planner` writes `docs/plan/{feature}-plan.md`, open it and locate the **PR Plan** section. The strategy (`1 PR` / `2 PRs` / `3 PRs`) tells you which `/create-pr` checkpoints above are active. Default behaviour when the section is absent: single `/create-pr` at the end of Phase 4.

---

### If Workflow B:

```
## Working Context

**Task**: {task}
**Type**: {type}
**Branch**: {branch}
**Workflow**: B — Simple Technical Workflow

### Steps
- [ ] Track progress with `TaskCreate` / `TaskUpdate` as you go
- [ ] Analyze: read relevant docs and code
- [ ] Propose plan in chat → wait for user validation
- [ ] Implement changes (write missing regression tests for any modified behavior)
- [ ] `just check` (or `just check-full` if tests needed)
- [ ] `reviewer-backend` → if any `.rs` modified
- [ ] `reviewer-frontend` → if any `.ts`/`.tsx` modified
- [ ] `reviewer-arch` (always) + `reviewer-sql` (if migrations) + `reviewer-infra` (if scripts, hooks, config, or workflow files changed) + `reviewer-security` _(if Tauri command, capability, or security-sensitive file modified)_
- [ ] Update `ARCHITECTURE.md` + `docs/todo.md` if behavior or module layout changed
- [ ] Ask user if another task is needed
- [ ] `/smart-commit` [HARD GATE]
- [ ] `/create-pr` → push branch and open PR (or merge directly: `git checkout main && git merge --no-ff fix/{name}`)
```
