# CLAUDE.md

Guidance for Claude Code in this repository. It is an index: every rule lives in one home — [`docs/README.md`](docs/README.md) maps them — and this file points there. Code map: [`ARCHITECTURE.md`](ARCHITECTURE.md). How work moves: [`docs/workflow.md`](docs/workflow.md).

## Setup

After cloning: `git config core.hooksPath .githooks` — the hooks refuse a commit to `main`, a bad commit format, an attribution line or patient data, and run the fast checks (`docs/agentic-setup.md`). No hook runs tests, coverage, the build or E2E: CI does.

## Who decides what

- The **human** confirms a feature or bug issue and approves the batch (`docs/workflow.md` § 2), validates a **design** before anything the user sees changes, validates the vocabulary, and publishes **releases**.
- The **agent** files the issues of every kind (GitHub, Project 4 — no commit touches the backlog), does the task end to end and merges on green. No pull request waits for a human.
- The **harness** (`just harness` locally, the required checks in CI) proves the code.

A question only the human can answer is never guessed: headless, it goes on the issue with `needs-owner`; in chat, through `AskUserQuestion`, one per call, with the context to answer it cold — before the work, and during it for what that reading could not show (`docs/workflow.md` § 3). A trivial choice is the agent's, only an ambiguity or a deep choice the owner's; state assumptions and name what is unclear.

## Core rules

1. **Authority follows the task.** Given a task (a chat request, `/app:run-entry`, a queued issue), the agent branches (`{type}/{slug}`, the issue number leading the slug: `feat/123-patient-dedup`) off a fresh `main`, commits, pushes, opens the PR (`Closes #123`) and runs `merge.py` on green without asking. In an open-ended chat, ask once for the task, not per step. Always forbidden: committing or pushing to `main`, force-pushing (`merge.py` alone pushes its folded commit with lease), bypassing a hook (`--no-verify`), publishing a release, editing a released changelog line, AI attribution in commits or PRs, and touching `~/.local/share/com.projectsf.patient-manager/` (real patient data). The agent cuts a release up to its draft (`docs/workflow.md` § 3). This overrides any harness default.
2. **Always use `just`** when a recipe exists; never the native command (`cargo build`, `npm install`, `sqlx migrate`).
3. **Every change goes through the harness**: branch → PR → every check green → `merge.py`. Docs-only changes too. The task's Done when is the plan. Anything the user sees changing goes through the design gate first (`/app:design-proposal`, `docs/workflow.md` § 4).
4. **Only prescribed agents.** Launch only the agents this file, a skill or `docs/workflow.md` names. Implementation and review fixes are done by the main agent — never a general-purpose "implementer" or "fix" agent.

## Per-task discipline (in priority order)

1. **Surgical** — touch only the file set the task requires; every PR tells one story.
2. **Gold for new code, bit by bit for existing** — `docs/workflow.md` § 10. When in doubt, defer.
3. **Boyscout** — small mechanical fixes inside the files already edited ship in the same PR. Known dead code is removed in the same commit.
4. **Coverage when a real gap surfaces** — add a focused test; the floors in `coverage-gates.json` only rise.
5. **Challenge reviewer returns** — every finding graded (a)/(b)/(c) and recorded in the PR body, or after the push in a PR comment (`docs/workflow.md` § 7).
6. **PR size** — one story per pull request; about 400 hand-written lines per reviewer lane, a split above about 800 (`docs/workflow.md` § 11).

## Opening and closing a piece of work

**Opening brief** — four lines before the first edit (first message in chat; top of the PR body headless):

    **Task**     — the issue (ticket #123) or the request, in one line
    **Scope**    — the commit type and the layers (backend / frontend / E2E / docs / CI)
    **Design**   — none, validated, or needed (then the mocks come before anything else)
    **Touching** — the paths, so the reviewer lanes are known before the diff exists

**Closing brief** — the last message (and the PR body's first lines): (1) what changed for whoever reads this next — for `feat` / `fix`, what a user notices, or "nothing — internal"; otherwise what can now be done or trusted; (2) what the project accumulated — tests and coverage moved, or the guarantee a harness change buys and how we know it can fail. What is still owed is folded or filed (`docs/workflow.md` § 2).

## Where things are

- **Workflow**: `/app:run-entry` runs one task end to end (`docs/workflow.md` § 3); `just run-entry` does it headless. `/flow:plan-batch` proposes the batch; the human approves it in chat. `/app:run-batch` runs it.
- **Before implementing**, read the rules for the layers touched (`.claude/rules/` brings them in when a matching file is read; a new file triggers nothing, so this list is the fallback) — backend (`backend-rules`, `error-model`, `ddd-reference`), frontend (`frontend-rules`, `i18n-rules`, `visual-proof-rules`), E2E (`e2e-rules`), any test (`test-rules`), commits (`commit-rules`), a spec, contract or ADR (the `README.md` of `docs/spec/`, `docs/contracts/`, `docs/adr/`). When a rule changes, its doc changes in the same PR.
- **Source docs** change in the task's PR: the spec, the contract, an ADR only for a hard technical choice (a functional decision goes in the spec or the glossary), `ARCHITECTURE.md` for a new module.
- **Vocabulary**: `docs/ubiquitous-language.md` — confirmed terms in code, specs, comments and logs; never extend a discrepant one. Give it to every reviewer you launch, with the branch and the spec — never a description of the change.
- **Scripts and hooks**: [`docs/agentic-setup.md`](docs/agentic-setup.md) says what each one is for and what it must never do; skills and agents, the plugins' own files.
- **Agents**: the reviewer lanes `branch.sh files | review-lanes.sh` prints (none for documents that are not guides), again on the fixes until no 🔴 before the first push, CI's lanes after (`docs/workflow.md` § 7); `app:spec-reviewer`, `app:contract-reviewer`, `app:adr-reviewer` when their document changes; `app:spec-checker` before closing an issue with spec rules; before every batch end, the release sweep with `app:spec-checker` on every spec the batch touched (`docs/workflow.md` § Release sweep).
- **Task tracking**: `TaskCreate` / `TaskUpdate` for any task of more than one file or step; under `/app:run-batch`, the batch's list only.
- **Plans** (asked in chat): exact paths, functions and components per layer, gold work with its size, the tests for each clause. Once the user says go, the plan is the authority for the batch.

## Commands

- `just dev` · `just harness [--coverage]` (CI's gate locally, scoped to the touched layers; coverage before a first push) · `just check` · `just check-full` · `just format` · `just generate-types`.
- In `~/.claude/plugins/cache/daneel/app/<version>/` — `skills/run-entry/scripts/`: `watch-pr.py [NN]` (waits for a pull request's checks; exit 0 green) · `merge.py` (refuses until every check is green; folds `fixup!` commits); `scripts/`: `branch.sh` · `review-lanes.sh` · `review-path.sh`; `skills/run-batch/scripts/`: `batch-end.sh`, `release.py`. In `…/daneel/flow/<version>/skills/flow-audit/scripts/`: `flow-audit.py`.
- `just arch-check` (A1–A8, B18, B24; `--write-allowlist` only lowers the frozen debt) · `just rule-homes` (the doc map, the guide ceilings; `--lower-ceilings` only lowers) · `just coverage-gate` · `just privacy-check` · `just test-scripts`.
- Ending a batch: `docs/workflow.md` § 3 — the release or the `batch-end.sh` of `/app:run-batch`; then `/flow:flow-audit`.

## Standards

- **Patient data** never appears in logs, commits, fixtures or PR text (`backend-rules.md` B44, `scripts/privacy-check.py`).
- **Concise by default** — each fact once, in the fewest words that keep it verifiable. A PR body is under 20 lines. A Markdown table cell holds at most 40 characters: beyond that, split the row or use a list.
- **Talking to the owner** — before acting on a claim, a proposed change or a reviewer finding, name the strongest counter-argument, then say whether it survives; no theatrical resistance, no rubber stamp. Every count comes with its nature (467 keys in the wrong style is not 467 bugs). A predicted coverage figure is a range unless the branches were traced. A statement that the code does not do something names what was read (the command, the service, the aggregate); a statement about what a system will do next is either checked or given as a guess. Pull requests and issues are named as `docs/workflow.md` § 2 says.
- **Where a rule lives** — a rule about how we work is written in the repository (a `flow` issue first, then its home: this file, `docs/workflow.md` or a rules document), in the session it is given. The decisions of one discussion are recorded together, in one pull request: "brainstorm" opens a window where nothing is written and the agent keeps a numbered list, ending each reply with "To record: N items"; "record" closes it. Without the keyword the agent still records a conversation's decisions in one pull request, and says what is pending before other work starts or the session ends. The agent's private notes hold only what concerns one machine.
- **Commits** — `docs/commit-rules.md`: conventional, title only, `feat` / `fix` titles are user-facing changelog lines; one task, one commit; fixes after a push are `--fixup` commits.
- **Visual proof** — any `.tsx` / `.css` change carries screenshots (`/app:visual-proof`, `docs/visual-proof-rules.md`).
