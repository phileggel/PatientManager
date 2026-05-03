# Spec-Driven Dev Toolchain — Reference Guide

Onboarding guide for claude-kit: a spec-driven dev toolchain that ships the agents, skills, scripts, and hooks driving the **spec → contract → plan → test-first → verify** workflow. For the full inventory, see `.claude/kit-tools.md`.

**Location**: `.claude/kit-readme.md` (read-only reference)

---

## Profiles

This kit ships a **generic layer** (process agents, skills, hooks) that works for any project, plus **profile overlays** that add stack-specific quality agents and scripts.

Declare your stack in `.claude/kit-profile` (plain text, one line):

```
tauri
```

| Profile | Stack                        | What you get                                                                        |
| ------- | ---------------------------- | ----------------------------------------------------------------------------------- |
| `tauri` | Tauri 2 + React 19 + Rust    | Generic layer + 7 quality agents + `check.py` / `release.py` + `tauri.just` recipes |
| `web`   | Axum + React 19 + PostgreSQL | Generic layer + 7 quality agents + `check.py` / `release.py` + `web.just` recipes   |
| (none)  | any                          | Generic layer only — process agents, skills, hooks. Manage quality agents locally.  |

**No profile is not an error.** Lua mods, Python CLIs, and any stack the kit doesn't cover yet use the generic layer and add their own local quality agents in `.claude/agents/`.

**To sync with your profile:**

```bash
# First time — add profile declaration
echo "tauri" > .claude/kit-profile

# Sync (auto-detects .claude/kit-profile)
./scripts/sync-config.sh

# Or override once without changing the file
./scripts/sync-config.sh --profile tauri
```

---

## Standard Workflows

### Option A — Full Feature Workflow

_Use for: New features, new business logic, significant UI changes, or complex refactoring._

**Gate types:**

- **Hard gate** — must stop and wait for user: `/smart-commit` only
- **Soft gate** — agent presents output, user may review; auto-proceeds if no 🔴 criticals

**Before starting:** confirm you are on a feature branch, not `main` (the pre-commit hook blocks direct commits to `main`). Create one if needed:

```bash
git checkout -b feat/{feature-name}
```

**Phase 1: Pre-implementation (Spec & Contract & Plan)**

1. Run **`/spec-writer`** skill → produces `docs/spec/{feature}.md`. [soft gate]
2. _(Optional)_ Run **`/adr-manager`** skill → produces `docs/adr/{ref}.md`.
3. Run **`spec-reviewer`** agent → validate spec quality + contractability. [soft gate — hard if 🔴]
4. Run **`/contract`** skill → produces or updates `docs/contracts/{domain}-contract.md`. [soft gate: human approves shape]
5. Run **`contract-reviewer`** agent → validate contract vs spec. [soft gate — hard if 🔴]
6. Run **`feature-planner`** agent → produces `docs/plan/{feature}-plan.md`. [auto]

**Phase 2: Backend layer**

1. Read `docs/plan/{feature}-plan.md` — Primary TaskList. Do not deviate from it.
2. Run **`test-writer-backend`** agent → writes all Rust stubs from contract, confirms red.
3. Implement backend — minimal: make failing tests pass, confirm green.
4. Run `just format` (rustfmt + clippy --fix).
5. Run **`reviewer-backend`** agent → fix issues.
6. _(Tauri only)_ Run `just generate-types` → updates `src/bindings.ts`. Fix TypeScript compilation errors from new bindings only (no UI work). Run `just check` → TypeScript clean.
7. **`/smart-commit`**: backend layer. [HARD GATE]

**Phase 3: Frontend layer**

1. Run **`test-writer-frontend`** agent → writes all Vitest stubs from contract (reads fresh bindings), confirms red.
2. Implement frontend — minimal: make failing tests pass, confirm green.
3. Run `just format`.
4. Run **`reviewer-frontend`** agent → fix issues.
5. **`/smart-commit`**: frontend layer. [HARD GATE]

**Phase 4: Review & Closure**

1. Run **`reviewer-arch`** agent (always) + **`reviewer-sql`** (if migrations) + **`reviewer-infra`** (if scripts, hooks, workflow, or config files were modified).
2. Update documentation (`ARCHITECTURE.md`, `docs/todo.md`).
3. Run **`spec-checker`** agent → confirm all spec rules and contract commands are covered.
4. **`/smart-commit`**: tests & docs. [HARD GATE]
5. **`/create-pr`** → push branch and open PR (or merge directly: `git checkout main && git merge --no-ff feat/{name}`).

---

### Option B — Simple Technical Workflow

_Use for: Bug fixes, dependency updates, minor maintenance (no new business rules or features)._

**Before starting:** create a feature branch if on `main`: `git checkout -b fix/{description}` (or `chore/`, `test/`, etc.)

1. **Analysis**: Read relevant documentation and analyze the codebase.
2. **Direct Plan**: Propose a concise TODO plan with exact file paths in the chat. Ask user to validate.
3. **Tracking**: Use `TaskCreate` / `TaskUpdate` tools to track workflow steps (`in_progress` when starting, `completed` when done).
4. **Implementation**: Execute the code changes.
5. **Review & Quality**: Run `python3 scripts/check.py` (or `just check-full`), write missing tests, and run relevant subagents (`reviewer-arch`, `reviewer-infra`, etc.) as in Phase 3 above.
6. **Closure**: Ask user if another task is needed before commit, otherwise use **`/smart-commit`** skill.
7. **`/create-pr`** → push branch and open PR (or merge directly: `git checkout main && git merge --no-ff fix/{name}`).

---

## Spec Rule Numbering System (TRIGRAM-NNN)

Specs use **TRIGRAM-NNN** format for business rules (e.g., `REF-010`, `PAY-020`, `INV-030`):

- **TRIGRAM** = 3-letter identifier unique per feature domain (e.g., REF for Refund, PAY for Payment)
- **NNN** = 3-digit number, organized by topic:
  - 010–019: Eligibility & initiation
  - 020–029: Creation
  - 030–039: Updates & status changes
  - 040–049: Deletion
  - 050–059: Extensions & future

**Immutability**: Once assigned, a rule number never changes. If a rule is removed, its number stays vacant.

**Registry**: All trigrams are registered in `docs/spec-index.md` (created by `/spec-writer`).

---

## Handling `[DECISION]` Criticals

Some reviewer criticals are tagged `[DECISION]`. These indicate that the correct fix requires an architectural choice — not a mechanical code change — and cannot be resolved without domain or team input.

**Recommended rule for your project's `CLAUDE.md`:**

> **Reviewer `[DECISION]` criticals must not be fixed unilaterally.** When a reviewer flags a Critical with `[DECISION]`, stop and present the finding to the user before writing any code. The reviewer's guidance describes the direction, not the final answer — the architectural boundary must be agreed upon first.

**Why this matters:** a cross-boundary import can be "fixed" in several structurally valid ways (new use-case, shared port, merged context). Choosing the wrong one silently encodes an architectural assumption that is hard to undo. The `[DECISION]` tag is the reviewer's signal that human judgment is required.

---

## Customizing / Extending Agents

Your project can:

- ✅ Add **local agents** in `.claude/agents/{your-agent}.md` (project-specific reviewers, validators, etc.)
- ✅ Add **local skills** in `.claude/skills/{your-skill}/SKILL.md`
- ❌ Do NOT modify kit agents/skills directly — they are overwritten on the next sync

If you need to extend a kit agent's behaviour:

1. Create a new local agent that invokes or wraps the kit agent's logic.
2. Add project-context or domain-specific validation.
3. Document it in your project's local `.claude/` directory.

---

## Before Major Project Releases

- Run agents on sample specs/code to validate output.
- Execute scripts to confirm they work in your environment.
- Check that `docs/spec-index.md` is up-to-date.
- Run `just check-full` (or `python3 scripts/check.py`) — all checks must pass.

---

## Troubleshooting

**Agent not found?**

- Check if the agent file exists: `ls -la .claude/agents/`
- Re-sync the kit (with your profile): `./scripts/sync-config.sh`
- Tauri-profile agents (reviewer-arch, reviewer-infra, test-writer-\*) require `.claude/kit-profile` to contain `tauri`

**Agent gives wrong output?**

- Verify your spec/code is at the expected path (e.g., `docs/spec/{feature}.md`, not `docs/{feature}.md`).
- Check that required files exist (e.g., `ARCHITECTURE.md`, `docs/adr/`).

**Trigram collision?**

- Check `docs/spec-index.md` for registered trigrams.
- Use a different 3-letter prefix for the new feature spec.
