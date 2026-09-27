# Workflow — the human sets expectations, the harness holds the line

How work moves from a request or `docs/todo.md` to a release, and the conventions the
agents and skills rely on. This document is the rule set; git history records how it
was built.

## 1. Who owns what

- **Human** — `docs/todo.md`: what is worth doing, its user value, its done-when, and
  the **Next** queue.
- **Human** — validating a **design** before anything the user sees changes.
- **Human** — cutting a **release**; several merged branches may wait for one.
- **Agent** — `docs/techdebt.md`: every observation, smell and proposal. The human
  queues from it.
- **Agent** — the task, end to end: tests, code, review, merge. **No pull request is
  validated by a human.**
- **Harness** — proving it, mechanically, on every pull request. Nothing merges that
  the harness has not passed.

Three human touchpoints, plus answering open questions. Everything else is the agent's
job or a machine gate.

## 2. Ids and the two files

| Id         | Names                   |
| ---------- | ----------------------- |
| `TODO-NNN` | an entry in todo.md     |
| `DEBT-NNN` | an entry in techdebt.md |
| `gh#NN`    | a GitHub issue or PR    |
| `TRI-NNN`  | a spec rule (below)     |

`#NNN` is never used for an entry: GitHub turns it into a link to PR NNN.

### `docs/todo.md` — human-owned

- `## Next` at the top holds the queue: `TODO-NNN` and `DEBT-NNN` references in the
  order to work them. The agent takes the first **ready** one and never edits the list.
- Every entry is `## TODO-NNN — title` and ends with `**User value:**`,
  `**Done when:**`, `**Design:**` and `**Open questions:**`.
- **Ready** means: queued, a Done when is written, `Open questions: none`, and
  `Design` is `none` or `validated`.
- The agent writes to this file in three places only: it sets `Design` to
  `proposed (…)` or `validated`, it adds open questions, and it removes an entry in the
  pull request that ships it. It never creates, rewrites or reorders entries.

### `docs/techdebt.md` — agent-owned

- Every entry carries a permanent id: `## YYYY-MM-DD — DEBT-NNN — title`. Numbers are
  never reused.
- The agent files here: reviewer findings it did not fix, smells met on the way,
  proposals for new work, coverage holes, frozen architecture debt.
- Entries are observations, not commitments. The human promotes one by queuing its
  `DEBT-NNN` in Next.

## 3. The loop — one run, one task

A task is a queued entry (`/next-todo`, headless), an entry the human names
(`/next-todo TODO-NNN`), or a request typed in chat ("do X"). A chat request leaves no
todo entry: the pull request body is its record.

1. **Pick and brief.** Open questions are asked together, once, before anything starts
   (in chat), or written into the entry and the run moves on (headless). The opening
   brief states Task, Scope, Design, Touching. Branch `<type>/todo-NNN-slug`,
   `<type>/debt-NNN-slug`, or `<type>/slug` off a fresh `main`, where `<type>` is the
   commit type the change will carry.
2. **Design gate** (§ 4) for anything the user sees.
3. **Acceptance first.** Each Done-when clause becomes a failing test: Rust for logic,
   Vitest for rendering, E2E for what a user does. Test names carry the entry id or the
   spec rule. A new business rule goes into `docs/spec/<feature>.md` in the same commit;
   a new or changed command updates `docs/contracts/<domain>-contract.md`. Confirm red.
4. **Implement** to green, the right way (§ 6).
5. **Self-check:** `just harness` (§ 5).
6. **Self-review:** the reviewer lanes the diff needs (§ 7), again on the fixes until no
   🔴 remains.
7. **Evidence:** `/visual-proof` for every changed component.
8. **PR**, opened for the record, not for approval. Body under 20 lines: the task, each
   Done-when clause with the test that proves it, findings that changed something,
   techdebt filed, screenshots.
9. **Merge:** `just merge` — it refuses until every check is green and folds `fixup!`
   commits, so the task lands as one commit.
10. **Closure** in the same PR: the entry removed from `docs/todo.md`, techdebt updated,
    `ARCHITECTURE.md` if a module appeared, the spec if a rule changed. The closing
    brief says what changed for the user and what the project gained.

**Release** — the human runs `just release` when they choose. It computes the version
from the merged titles, writes the changelog (only `feat` → Added, `fix` → Fixed),
tags and pushes; CI builds the draft; the human publishes it.

## 4. Design proposal

Before **any** change to what the user sees — a new screen, a moved or added control, a
changed layout or wording pattern — the agent renders mocks of the target state with
the real components and tokens (`/design-proposal`):
`screenshots/design/{id}-{state}-{light|dark}.png` plus a five-line note (what moves,
is added, is removed, stays).

- **In chat:** the mocks are shown; nothing is built until the human says yes. The yes
  sets the entry's `Design` line to `validated`.
- **Headless:** the run sets `Design: proposed (screenshots/design/…)`, merges that as
  a docs change, and moves on to the next ready entry; the human validates by editing
  the line.

Once the work ships, the proposal images are deleted in the closure commit; the visual
proofs are the record.

## 5. The harness

`just harness` runs it locally, scoped to the layers the branch touched; the same
checks are required on every pull request (`required-checks.json`), and `just merge`
refuses without them. The git hooks run only fast checks for the same scope; the script
unit tests never run in a hook (hooks export `GIT_DIR`).

- **Lint, format, types, build** — `scripts/check.py`, every PR.
- **Architecture rules A1–A7** — `scripts/arch-check.py`; today's debt is frozen in
  `arch-allowlist.json` and may only shrink.
- **Tests with coverage** — Vitest and `cargo llvm-cov`, for the layers a PR touches;
  pushes to `main` run both.
- **Coverage floors** — `scripts/coverage-gate.py` + `coverage-gates.json`, logic code
  only; a ratchet, never lowered.
- **Patient data** — `scripts/privacy-check.py`: no SSN or IBAN with valid check digits,
  no private value in a log call, no real data file; in the hooks, on the tree, and on
  the PR description (`pr-description.yml`).
- **E2E on the real app** — `e2e.yml`, every PR; a docs-only diff ends green early.
- **Reviewers** — `review.yml`, one job per lane the diff touches; any 🔴 fails.
- **Codec round-trip** — `codec-gate.yml`, when import codecs or fixtures change.
- **Commit hygiene** — conventional title of at most 72 characters, no trailer; titles
  only in practice.
- **Dependency advisories** — `security-audit.yml`, weekly.

## 6. The right way to code

- **Gold layouts** for new code (`docs/backend-rules.md` B0/B37–B43,
  `docs/frontend-rules.md` F0/F26–F28); bit-by-bit for existing code (CLAUDE.md).
- **Typed errors** on the wire (`docs/error-model.md`); factories and aggregate-root
  methods on domain objects.
- **Stable ids** on every interactive element; text from i18n.
- **Ubiquitous language** in every identifier (`docs/ubiquitous-language.md`).
- **No patient data** in logs, commits, fixtures or PR text.
- **Surgical:** touch the file set the task needs; boyscout inside it, never beyond.

## 7. Reviewers and the triage policy

Before the PR, run exactly the lanes
`bash scripts/branch.sh files | bash scripts/review-lanes.sh` prints — none for a
docs-only change — and again on the fixes until no 🔴 remains. CI runs the same lanes
on every push as the last net, with the prompts taken from `main`. Also:
`spec-reviewer` / `contract-reviewer` / `adr-reviewer` when those documents change,
`spec-checker` before closing an entry that carries spec rules.

Every finding, local or from CI, is graded and the outcome recorded in the PR body:

- **(a)** in scope → fix in the PR.
- **(b)** bigger, or outside the file set → `DEBT-NNN` entry, linked from the PR body.
- **(c) one-off** false positive → inline comment `<reviewer> FP: <reason> — see PR #NN`.
- **(c) pattern** → a "not a finding" rule in the reviewer's prompt, same PR.
- **A CI finding the local run missed** → a rule in that reviewer's prompt, same PR.
- **`[DECISION]`** → see Conventions below.

## 8. Budget and stop rules

- One task, one run, three hours of wall clock. Over budget → open question "larger
  than estimated: split?", stop.
- The same gate failing three times on one task → open question, stop.
- An E2E failure that passes on re-run → the flake is filed as `DEBT-NNN`, the run
  continues.
- **Never:** touch the installed application's data
  (`~/.local/share/com.projectsf.patient-manager/` holds real patient data), push to
  `main`, force-push, bypass a hook, edit a released changelog line, reorder Next, cut
  a release.

## 9. Where the loop runs

The chat session is for writing entries together, design conversations and answering
open questions. The loop runs one task per run and keeps its state in git and the two
files.

- **In chat:** `/next-todo TODO-NNN`, or a plain request.
- **Laptop:** `just next-todo` — one ready entry, headless, three hours of budget; a
  command outside the allow list in `.claude/settings.json` is denied, so the run fails
  instead of waiting.
- **Cloud routine** on claude.ai, created disabled; the human switches it on.

---

## Conventions

### Spec rule numbering (TRIGRAM-NNN)

Specs use **TRIGRAM-NNN** for business rules (e.g. `REF-010`, `PAY-020`):

- **TRIGRAM** — 3-letter identifier unique per feature domain, registered in
  `docs/spec-index.md`.
- **NNN** — 3-digit number, grouped by topic: 010–019 eligibility & initiation,
  020–029 creation, 030–039 updates & status changes, 040–049 deletion, 050–059
  extensions.

Once assigned, a rule number never changes. A removed rule leaves its number vacant.

### `[DECISION]` criticals

A reviewer critical tagged `[DECISION]` needs an architectural choice, not a mechanical
fix. It is never fixed unilaterally: it becomes an open question on the entry, or goes
to the human in chat, and the PR stays open. Once the choice is made, record it with
`/adr-writer` → `adr-reviewer` in `docs/adr/` before applying the fix.

### Reviewer reports — `.review/`

The `reviewer-*` agents save their full output to `.review/{slug}-{date}-{NN}.md` via
`bash scripts/review-path.sh {slug}`; `/review-triage` reads them to grade findings.
`.review/` is gitignored and safe to delete.

### Authoring rule — no compound shell in agent / skill prompts

Bash blocks in `.claude/agents/*.md` and `.claude/skills/*/SKILL.md` must not use
command substitution (`$(...)`), `&&`, `||`, `;`, or `cd X && cmd` chains: the
permission allowlist matches a command by literal prefix, so a compound line prompts on
every run. Move the logic into a script under `scripts/` and call it by name; for a
multi-line payload, write a temp file and pass it (`gh pr create --body-file …`).

### Release sweep

Before a release, run the reviewer agents in `release-sweep` mode (the invoking prompt
contains `release-sweep`) alongside `/dep-audit`.
