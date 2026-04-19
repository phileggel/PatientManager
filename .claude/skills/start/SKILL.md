---
name: start
description: Select the right workflow for the current task and output an actionable working context for the session. Optional scope argument (fix, chore, test, feature, refactor) pre-selects a workflow; user can always switch.
tools: AskUserQuestion
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

## Step 3 — Output working context

Output the block below immediately after the user answers. This block is the main agent's session context — it drives the rest of the work.

---

Replace `{task}` with the user's description and `{type}` with the scope argument or "unspecified".

---

### If Workflow A:

```
## Working Context

**Task**: {task}
**Type**: {type}
**Workflow**: A — Full Feature Workflow

### Phase 1 — Spec & Contract & Plan
- [ ] `/spec-writer` → `docs/spec/{domain}.md`
- [ ] `spec-reviewer` → validate spec quality [soft gate — hard if 🔴]
- [ ] `/contract` → `docs/contracts/{domain}-contract.md` [human approves shape]
- [ ] `contract-reviewer` → validate contract vs spec [soft gate — hard if 🔴]
- [ ] `feature-planner` → `docs/plan/{feature}-plan.md`

### Phase 2 — Backend
- [ ] `test-writer-backend` → Rust stubs from contract, confirm red
- [ ] Implement backend (make tests green)
- [ ] `just format`
- [ ] `reviewer-backend` → fix issues
- [ ] `just generate-types` → updates `src/bindings.ts`
- [ ] `/smart-commit`: backend layer [HARD GATE]

### Phase 3 — Frontend
- [ ] `test-writer-frontend` → Vitest stubs from contract, confirm red
- [ ] Implement frontend (make tests green)
- [ ] `just format`
- [ ] `reviewer-frontend` → fix issues
- [ ] `/smart-commit`: frontend layer [HARD GATE]

### Phase 4 — Review & Closure
- [ ] `reviewer` (always) + `reviewer-sql` (if migrations) + `maintainer` (if config changed)
- [ ] `i18n-checker` (if UI text changed)
- [ ] `script-reviewer` (if scripts or hooks modified)
- [ ] Update `ARCHITECTURE.md` + `docs/todo.md`
- [ ] `spec-checker` → all rules and contract commands covered
- [ ] `/smart-commit`: tests & docs [HARD GATE]
- [ ] `workflow-validator` → final sign-off
```

---

### If Workflow B:

```
## Working Context

**Task**: {task}
**Type**: {type}
**Workflow**: B — Simple Technical Workflow

### Steps
- [ ] Analyze: read relevant docs and code
- [ ] Propose plan in chat → wait for user validation
- [ ] Implement changes
- [ ] `just check` (or `just check-full` if tests needed)
- [ ] Run relevant reviewers (`reviewer`, `script-reviewer`, etc.) as needed
- [ ] Ask user if another task is needed
- [ ] `/smart-commit` [HARD GATE]
```
