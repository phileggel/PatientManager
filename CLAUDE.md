# CLAUDE.md

Guidance for Claude Code in this repository. It is an index: every rule lives in one home — [`docs/README.md`](docs/README.md) maps them — and this file points there. Code map: [`ARCHITECTURE.md`](ARCHITECTURE.md). How work moves: [`docs/workflow.md`](docs/workflow.md).

## Setup

After cloning: `git config core.hooksPath .githooks`. The hooks block commits to `main`, check the commit format, reject `Co-Authored-By` lines and patient data, and run the fast checks for what a commit or push touches. Tests, coverage, the build and E2E are CI's job on the pull request.

## Who decides what

- The **human** writes the todo entries (`docs/work/todo/`) and the queue (`docs/work/queue.md`), validates a **design** before anything the user sees changes, validates the vocabulary, and cuts **releases**.
- The **agent** owns the debt and flow entries (`docs/work/debt/`, `docs/work/flow/`), does the task end to end and merges on green. No pull request waits for a human.
- The **harness** (`just harness` locally, the required checks in CI) proves the code.

Headless, a question only the human can answer goes into the entry as an open question, never guessed. In chat, a question is asked alone, with the context to answer it cold (what happened, what each option changes, what it costs), and the next one waits for the answer; ask during the work rather than guess, for a spec point as for a vocabulary term. State assumptions; name what is unclear.

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
5. **Challenge reviewer returns** — every finding graded (a)/(b)/(c) and recorded in the PR body (`docs/workflow.md` § 7).
6. **PR size** — one story per pull request; about 400 hand-written lines per reviewer lane, a split above about 800 (`docs/workflow.md` § 11).

## Opening and closing a piece of work

**Opening brief** — four lines before the first edit (first message in chat; top of the PR body headless):

    **Task**     — the entry (TODO-NNN / DEBT-NNN) or the request, in one line
    **Scope**    — the commit type and the layers (backend / frontend / E2E / docs / CI)
    **Design**   — none, validated, or needed (then the mocks come before anything else)
    **Touching** — the paths, so the reviewer lanes are known before the diff exists

**Closing brief** — the last message (and the PR body's first lines): (1) what changed for whoever reads this next — for `feat` / `fix`, what a user notices, or "nothing — internal"; otherwise what can now be done or trusted; (2) what the project accumulated — tests and coverage moved, or the guarantee a harness change buys and how we know it can fail. What is still owed becomes a debt entry (`docs/work/debt/`).

## Where things are

- **Workflow**: `/next-todo` runs one task end to end (`docs/workflow.md` § 3); `just next-todo` does it headless. `/whats-next` proposes the queue; the human validates it in chat or edits it by hand.
- **Before implementing**, read the rules for the layers touched (`.claude/rules/` brings them in when a matching file is read; a new file triggers nothing, so this list is the fallback) — backend (`backend-rules`, `error-model`, `ddd-reference`), frontend (`frontend-rules`, `i18n-rules`, `visual-proof-rules`), E2E (`e2e-rules`), any test (`test-rules`), commits (`commit-rules`). When a rule changes, its doc changes in the same PR.
- **After completing**, update the source docs in the same PR: spec rules (+ `spec-reviewer`), the contract (+ `contract-reviewer`), an ADR only for a hard technical choice whose explanation must be kept (`/adr-writer` + `adr-reviewer`) — a functional decision is written in the spec or the glossary, never as an ADR, `docs/lessons.md` for a failure worth teaching, `ARCHITECTURE.md` when a module appears.
- **Vocabulary**: `docs/ubiquitous-language.md` — confirmed terms in code, specs, comments and logs; never extend a discrepant one. Give it to every reviewer you launch, with the branch and the spec — never a description of the change.
- **Skills**: `/next-todo`, `/whats-next`, `/design-proposal`, `/visual-proof`, `/spec-writer`, `/contract`, `/adr-writer`, `/dep-audit`, `/flow-audit` (once, after a release). A spec, a contract and an ADR are always written with their skill, never by hand: the templates prevent the format findings the reviewers otherwise raise.
- **Agents**: exactly the reviewer lanes `bash scripts/branch.sh files | bash scripts/review-lanes.sh` prints (none for docs only), re-run on the fixes until no 🔴, then push; CI runs the same lanes. `reviewer-security` in `release-sweep` mode before every release; `spec-checker` before closing an entry with spec rules, and on every spec the batch touched before a release; `spec-reviewer` / `contract-reviewer` / `adr-reviewer` when those documents change.
- **Task tracking**: `TaskCreate` / `TaskUpdate` for any task of more than one file or step.
- **Plans** (asked in chat): exact paths, functions and components per layer, gold work with its size, the tests for each clause. Once the user says go, the plan is the authority for the batch.

## Commands

- `just dev` · `just harness` (CI's gate locally, scoped to the touched layers) · `just check` · `just check-full` · `just format` · `just generate-types` · `just merge` (refuses until every check is green; folds `fixup!` commits).
- `just watch-pr [NN]` (waits for a pull request's checks; exit 0 green) · `just whats-next close <id>` (deletes a shipped entry's file) · `just whats-next next-id <KIND>` (the next free entry id) · `just flow-audit <since> [until]` (a batch's figures).
- `just arch-check` (A1–A8, B18, B24; `--write-allowlist` only lowers the frozen debt) · `just rule-homes` (the doc map) · `just coverage-gate` · `just privacy-check` · `just test-scripts`.
- Release: the agent prepares it (`/dep-audit`, the security release sweep, `spec-checker` on the touched specs) and says when it is ready; the human runs `just release [--dry-run] [-y]`; the agent publishes the draft once the release workflow and `main` are green, and stops if anything is red; then `/flow-audit`.

## Standards

- **Patient data** never appears in logs, commits, fixtures or PR text (`backend-rules.md` B44, `scripts/privacy-check.py`).
- **Concise by default** — each fact once, in the fewest words that keep it verifiable. A PR body is under 20 lines. A Markdown table cell holds at most 40 characters: beyond that, split the row or use a list.
- **Talking to the owner** — before acting on a claim, a proposed change or a reviewer finding, name the strongest counter-argument, then say whether it survives; no theatrical resistance, no rubber stamp. Every count comes with its nature (467 keys in the wrong style is not 467 bugs). A predicted coverage figure is a range unless the branches were traced. In chat a pull request is `PR #NN`, never `gh#NN`, which reads as an issue.
- **Where a rule lives** — a rule about how we work is written in the repository (a flow entry in `docs/work/flow/` first, then its home: this file, `docs/workflow.md` or a rules document), in the session it is given. The agent's private notes hold only what concerns one machine.
- **Commits** — `docs/commit-rules.md`: conventional, title only, `feat` / `fix` titles are user-facing changelog lines; one task, one commit; fixes after a push are `--fixup` commits.
- **Visual proof** — any `.tsx` / `.css` change carries screenshots (`/visual-proof`, `docs/visual-proof-rules.md`).
