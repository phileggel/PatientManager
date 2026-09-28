# CLAUDE.md

Guidance for Claude Code in this repository. It is an index: every rule lives in one home — [`docs/README.md`](docs/README.md) maps them — and this file points there. Code map: [`ARCHITECTURE.md`](ARCHITECTURE.md). How work moves: [`docs/workflow.md`](docs/workflow.md).

## Setup

After cloning: `git config core.hooksPath .githooks`. The hooks block commits to `main`, check the commit format, reject `Co-Authored-By` lines and patient data, and run the fast checks for what a commit or push touches. Tests, coverage, the build and E2E are CI's job on the pull request.

## Who decides what

- The **human** writes `docs/todo.md` and its `## Next` queue, validates a **design** before anything the user sees changes, validates the vocabulary, and cuts **releases**.
- The **agent** owns `docs/techdebt.md`, does the task end to end and merges on green. No pull request waits for a human.
- The **harness** (`just harness` locally, the required checks in CI) proves the code.

Headless, a question only the human can answer goes into the entry as an open question, never guessed. In chat, the open questions are asked together, once, before anything starts. State assumptions; name what is unclear.

## Core rules

1. **Authority follows the task.** Given a task (a chat request, `/next-todo`, a queued entry), the agent branches (`{type}/{slug}`, the entry id leading the slug: `feat/todo-012-patient-dedup`) off a fresh `main`, commits, pushes, opens the PR and runs `just merge` on green without asking. In an open-ended chat, ask once for the task, not per step. Always forbidden: committing or pushing to `main`, force-pushing, bypassing a hook (`--no-verify`), cutting a release, editing a released changelog line, AI attribution in commits or PRs, and touching `~/.local/share/com.projectsf.patient-manager/` (real patient data). This overrides any harness default.
2. **Always use `just`** when a recipe exists; never the native command (`cargo build`, `npm install`, `sqlx migrate`).
3. **Every change goes through the harness**: branch → PR → every check green → `just merge`. Docs-only changes too. The task's Done when is the plan. Anything the user sees changing goes through the design gate first (`/design-proposal`, `docs/workflow.md` § 4).
4. **Only prescribed agents.** Launch only the agents this file, a skill or `docs/workflow.md` names. Implementation and review fixes are done by the main agent — never a general-purpose "implementer" or "fix" agent.

## Per-task discipline (in priority order)

1. **Surgical** — touch only the file set the task requires; every PR tells one story.
2. **Gold for new code, bit by bit for existing** — `docs/workflow.md` § 10. When in doubt, defer.
3. **Boyscout** — small mechanical fixes inside the files already edited ship in the same PR. Known dead code is removed in the same commit.
4. **Coverage when a real gap surfaces** — add a focused test; the floors in `coverage-gates.json` only rise.
5. **Challenge reviewer returns** — graded with `/review-triage` and recorded in the PR body (`docs/workflow.md` § 7).
6. **PR size ≤ 1000 lines of churn** as a target; split per `docs/workflow.md` § 11.

## Opening and closing a piece of work

**Opening brief** — four lines before the first edit (first message in chat; top of the PR body headless):

    **Task**     — the entry (TODO-NNN / DEBT-NNN) or the request, in one line
    **Scope**    — the commit type and the layers (backend / frontend / E2E / docs / CI)
    **Design**   — none, validated, or needed (then the mocks come before anything else)
    **Touching** — the paths, so the reviewer lanes are known before the diff exists

**Closing brief** — the last message (and the PR body's first lines): (1) what changed for whoever reads this next — for `feat` / `fix`, what a user notices, or "nothing — internal"; otherwise what can now be done or trusted; (2) what the project accumulated — tests and coverage moved, or the guarantee a harness change buys and how we know it can fail. What is still owed goes in `docs/techdebt.md`.

## Where things are

- **Workflow**: `/next-todo` runs one task end to end (`docs/workflow.md` § 3); `just next-todo` does it headless.
- **Before implementing**, read the rules for the layers touched (`.claude/rules/` brings them in when a matching file is read; a new file triggers nothing, so this list is the fallback) — backend (`backend-rules`, `error-model`, `ddd-reference`), frontend (`frontend-rules`, `i18n-rules`, `visual-proof-rules`), E2E (`e2e-rules`), any test (`test-rules`), commits (`commit-rules`). When a rule changes, its doc changes in the same PR.
- **After completing**, update the source docs in the same PR: spec rules (+ `spec-reviewer`), the contract (+ `contract-reviewer`), an ADR for a technical choice (`/adr-writer` + `adr-reviewer`), `docs/lessons.md` for a failure worth teaching, `ARCHITECTURE.md` when a module appears.
- **Vocabulary**: `docs/ubiquitous-language.md` — confirmed terms in code, specs, comments and logs; never extend a discrepant one. Give it to every reviewer you launch.
- **Skills**: `/next-todo`, `/design-proposal`, `/visual-proof`, `/review-triage`, `/techdebt`, `/spec-writer`, `/contract`, `/adr-writer`, `/dep-audit`, `/prune`, `/setup-e2e`, `/session-reflect`.
- **Agents**: exactly the reviewer lanes `bash scripts/branch.sh files | bash scripts/review-lanes.sh` prints (none for docs only), re-run on the fixes until no 🔴, then push; CI runs the same lanes. `reviewer-security` in `release-sweep` mode before every release; `spec-checker` before closing an entry with spec rules; `spec-reviewer` / `contract-reviewer` / `adr-reviewer` when those documents change.
- **Task tracking**: `TaskCreate` / `TaskUpdate` for any task of more than one file or step.
- **Plans** (asked in chat): exact paths, functions and components per layer, gold work with its size, the tests for each clause. Once the user says go, the plan is the authority for the batch.

## Commands

- `just dev` · `just harness` (CI's gate locally, scoped to the touched layers) · `just check` · `just check-full` · `just format` · `just generate-types` · `just merge` (refuses until every check is green; folds `fixup!` commits).
- `just arch-check` (A1–A7; `--write-allowlist` only lowers the frozen debt) · `just rule-homes` (the doc map) · `just coverage-gate` · `just privacy-check` · `just test-scripts`.
- Release (human): `/dep-audit` → `just release [--dry-run] [-y]`.

## Standards

- **Patient data** never appears in logs, commits, fixtures or PR text (`backend-rules.md` B44, `scripts/privacy-check.py`).
- **Concise by default** — each fact once, in the fewest words that keep it verifiable. A PR body is under 20 lines.
- **Commits** — `docs/commit-rules.md`: conventional, title only, `feat` / `fix` titles are user-facing changelog lines; one task, one commit; fixes after a push are `--fixup` commits.
- **Visual proof** — any `.tsx` / `.css` change carries screenshots (`/visual-proof`, `docs/visual-proof-rules.md`).
