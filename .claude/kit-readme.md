# Claude-Assisted Factory — Reference Guide

Onboarding guide for claude-kit: an opinionated Claude-assisted factory for Tauri 2 + React 19 + Rust projects. Ships the full SDD stack — convention docs, agents, skills, scripts, hooks, and justfile recipes — driving the **spec → contract → plan → test-first → verify** workflow. For the full inventory, see `.claude/kit-tools.md`.

**Location**: `.claude/kit-readme.md` (read-only reference)

---

## Sync

```bash
./scripts/sync-config.sh            # latest release tag
./scripts/sync-config.sh v4.0.0     # specific tag
./scripts/sync-config.sh -f         # overwrite drifted docs without prompting
```

The script self-updates before syncing: if `sync-config.sh` itself changed in the kit, it re-executes the new version automatically. Review `git diff` after syncing.

---

## Convention Docs

The kit syncs 7 convention docs into `docs/` on first sync (copy-once — never overwrites project customizations). They are the authoritative reference for the stack's coding standards and are read directly by review and test agents:

| Doc                        | What it governs                          |
| -------------------------- | ---------------------------------------- |
| `backend-rules.md`         | Rust DDD structure and patterns          |
| `frontend-rules.md`        | React feature layout, gateway pattern    |
| `e2e-rules.md`             | WebdriverIO testability conventions      |
| `test_convention.md`       | Testing strategy across all tiers        |
| `ddd-reference.md`         | DDD concept glossary                     |
| `i18n-rules.md`            | Translation structure and key naming     |
| `frontend-visual-proof.md` | Screenshot/video workflow for UI changes |

**Do not edit these files directly.** Update them in the kit and re-sync. Rule numbers (B1, F3, etc.) are stable — never renumber.

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
2. _(Optional)_ Run **`/adr-writer`** skill → produces `docs/adr/{ref}.md`. Then run **`adr-reviewer`** agent → quality gate before the decision is locked in.
3. Run **`spec-reviewer`** agent → validate spec quality + contractability. [soft gate — hard if 🔴]
4. Run **`/contract`** skill → produces or updates `docs/contracts/{domain}-contract.md`. [soft gate: human approves shape]
5. Run **`contract-reviewer`** agent → validate contract vs spec. [soft gate — hard if 🔴]
6. Run **`feature-planner`** agent → produces `docs/plan/{feature}-plan.md`. [auto]
7. Run **`plan-reviewer`** agent → validate plan vs spec + contract. [soft gate — hard if 🔴]
8. Switch the main agent to **`sonnet`** before Phase 2 — execution against locked artifacts is mechanical work; opus is reserved for design (Phase 1) or design-level rework triggered by reviewer findings.

**Phase 2: Backend layer**

1. Read `docs/plan/{feature}-plan.md` — Primary TaskList. Do not deviate from it.
2. _(If schema changes per plan)_ Write migration → `just migrate` → `just prepare-sqlx`.
3. Run **`test-writer-backend`** agent → writes all Rust stubs from contract, confirms red.
4. Implement backend — minimal: make failing tests pass, confirm green.
5. Run `just format` (rustfmt + clippy --fix).
6. Run **`reviewer-backend`** agent → fix issues.
7. Run `just generate-types` → updates `src/bindings.ts`. Fix TypeScript compilation errors from new bindings only (no UI work). Run `just check` → TypeScript clean.
8. **`/smart-commit`**: backend layer. [HARD GATE]

**Phase 3: Frontend layer**

1. Run **`test-writer-frontend`** agent → writes all Vitest stubs from contract (reads fresh bindings), confirms red.
2. Implement frontend — minimal: make failing tests pass, confirm green.
3. Run `just format`.
4. Run **`reviewer-frontend`** agent → fix issues.
5. **`/smart-commit`**: frontend layer. [HARD GATE]

**Phase 4: Review & Closure**

1. Run **`test-writer-e2e`** agent → produces pyramid-friendly E2E scenarios for critical-path commands. Run `/setup-e2e` first if not done. The main agent runs the suite and triages any failure with full implementation context.
2. Run **`reviewer-e2e`** agent on E2E test files → fix issues.
3. **`/smart-commit`**: E2E layer. [HARD GATE]
4. Run **`reviewer-arch`** agent (always) + **`reviewer-sql`** (if migrations) + **`reviewer-infra`** (if scripts, hooks, workflow, or config files were modified) + **`reviewer-security`** (if Tauri command, capability, or security-sensitive file modified).
5. Update documentation (`ARCHITECTURE.md`, `docs/todo.md`).
6. Run **`spec-checker`** agent → confirm all spec rules and contract commands are covered.
7. **`/smart-commit`**: tests & docs. [HARD GATE]
8. **`/create-pr`** → push branch and open PR (or merge directly: `git checkout main && git merge --no-ff feat/{name}`).

---

### Option B — Simple Technical Workflow

_Use for: Bug fixes, dependency updates, minor maintenance (no new business rules or features)._

**Before starting:** create a feature branch if on `main`: `git checkout -b fix/{description}` (or `chore/`, `test/`, etc.)

1. **Analysis**: Read relevant documentation and analyze the codebase.
2. **Direct Plan**: Propose a concise TODO plan with exact file paths in the chat. Ask user to validate.
3. **Tracking**: Use `TaskCreate` / `TaskUpdate` tools to track workflow steps (`in_progress` when starting, `completed` when done).
4. **Implementation**: Execute the code changes.
5. **Review & Quality**: Run `just check` (or `just check-full`), write missing tests, then run reviewers: `reviewer-backend` (if `.rs` modified) · `reviewer-frontend` (if `.ts`/`.tsx` modified) · `reviewer-arch` (always) · `reviewer-sql` (if migrations) · `reviewer-infra` (if scripts, hooks, config, or workflow files changed) · `reviewer-security` (if Tauri command, capability, or security-sensitive file modified).
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

### Authoring rule — no compound shell in agent / skill prompts

Bash blocks inside agents (`kit/agents/*.md`) and skills (`kit/skills/*/SKILL.md`) **must not** contain compound shell. Specifically, the following patterns are rejected by `scripts/check.py`'s `No compound shell in prompts` rule:

- Command substitution: `$(...)` (e.g. `BASE=$(git merge-base ...)`)
- Sequence operators: `cmd1 && cmd2`, `cmd1 || cmd2`
- Command separator: `cmd1 ; cmd2`
- `cd X && cmd` chains

Why: Claude Code's permission allowlist matches by **literal prefix** on the command string. A line like `BASE=$(...); git diff "$BASE"..HEAD -- foo` cannot match any `Bash(...)` allowlist entry because it does not start with the tool you want to authorize. The result is an unavoidable permission prompt on every invocation — on a sweep PR, dozens of prompts per reviewer run.

**Fix**: extract the logic to a script in `kit/scripts/` and call it by literal name. Example already in the kit: `branch.sh {base|diff|log}` consolidates branch-base git operations behind one allowlistable entry (`Bash(bash scripts/branch.sh *)`). When a multi-line body or other quoted payload is the obstacle, write it to a temp file via the Write tool first, then call the consumer (e.g. `gh pr create --body-file …`) as a single literal command.

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
- Re-sync the kit: `./scripts/sync-config.sh`

**Agent gives wrong output?**

- Verify your spec/code is at the expected path (e.g., `docs/spec/{feature}.md`, not `docs/{feature}.md`).
- Check that required files exist (e.g., `ARCHITECTURE.md`, `docs/adr/`).

**Trigram collision?**

- Check `docs/spec-index.md` for registered trigrams.
- Use a different 3-letter prefix for the new feature spec.
