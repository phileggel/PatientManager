---
name: start
description: Select the right workflow for the current task and output an actionable working context for the session. Optional scope argument (fix, chore, test, feature, refactor) pre-selects a workflow; user can always switch.
tools: AskUserQuestion, Bash
---

# Skill — `start`

Invocation: `/start [fix|chore|test|feature|refactor]`

---

## Step 1 — Determine workflow suggestion from scope

| Scope      | Suggestion                |
| ---------- | ------------------------- |
| `feature`  | A — Full Feature Workflow |
| `refactor` | ask — could go either way |
| `fix`      | B — Simple Workflow       |
| `chore`    | B — Simple Workflow       |
| `test`     | B — Simple Workflow       |
| (none)     | ask                       |

## Step 2 — Ask the user

Use **AskUserQuestion** to collect two things in one call:

**Q1 — Task description**: "What needs to be done?" (one sentence, free text)

**Q2 — Workflow**: show both options; pre-select the suggested one (mark as Recommended if a suggestion exists):

- `A — Full workflow` — new feature, business logic, contract changes, significant refactor
- `B — Simple workflow` — bug fix, chore, tests, maintenance, no new business rules

## Step 3 — Check branch before outputting context

Before outputting anything, run `git branch --show-current` to check the current branch.

- If on `main`: use **AskUserQuestion** to ask for a branch name, then run `git checkout -b {branch}`. Do not proceed until the branch is created.
- If already on a feature branch: proceed.

## Step 4 — Output working context

Output the block below immediately after the branch check. This block is the main agent's session context — it drives the rest of the work.

---

Replace `{task}` with the user's description, `{type}` with the scope argument or "unspecified", and `{branch}` with the current branch name from `git branch --show-current`.

---

### If Workflow A:

```
## Working Context

**Task**: {task}
**Type**: {type}
**Branch**: {branch}
**Workflow**: A — Full Feature Workflow

### Phase 1 — Spec & Contract & Plan _(main agent: opus)_
- [ ] `/spec-writer` → `docs/spec/{domain}.md`
- [ ] `spec-reviewer` → validate spec quality [soft gate — hard if 🔴]
- [ ] `/contract` → `docs/contracts/{domain}-contract.md` [human approves shape]
- [ ] `contract-reviewer` → validate contract vs spec [soft gate — hard if 🔴]
- [ ] `feature-planner` → `docs/plan/{feature}-plan.md`
- [ ] `plan-reviewer` → validate plan vs spec + contract [soft gate — hard if 🔴]

> **🔀 Switch main agent to `sonnet`** once `plan-reviewer` returns green. Phases 2–3 are
> mechanical execution against locked artifacts; sonnet is the right model for that. Switch back
> to `opus` only if a reviewer surfaces a design-level finding that requires re-planning.

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
- [ ] `test-writer-e2e` → E2E tests from contract, confirm green (run `/setup-e2e` first if not done)
- [ ] `reviewer-frontend` _(reviews E2E test files)_
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
