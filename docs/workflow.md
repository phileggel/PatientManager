# Workflow — the human sets expectations, the harness holds the line

How work moves from a request or an entry of `docs/work/` to a batch end, and the conventions the
agents and skills rely on. This document is the rule set; git history records how it
was built.

## 1. Who owns what

- **Shared** — the todo entries (`docs/work/todo/`), each what a user will see; the human
  confirms its user value and done-when, and writes the queue (`docs/work/queue.md`).
- **Human** — validating a **design** before anything the user sees changes.
- **Human** — cutting a **release**; several merged branches may wait for one.
- **Agent** — the debt entries (`docs/work/debt/`): every observation, smell and proposal
  about the code. The human queues from them.
- **Agent** — the flow entries (`docs/work/flow/`): the same about the workflow itself
  (checks, waits, tools, the human's part), audited after each batch (§ 12).
- **Agent** — the task, end to end: tests, code, review, merge. **No pull request is
  validated by a human.**
- **Harness** — proving it, mechanically, on every pull request. Nothing merges that
  the harness has not passed.

Three human touchpoints, plus answering open questions. Everything else is the agent's
job or a machine gate.

## 2. Ids, entries and the queue

| Id         | Names                    |
| ---------- | ------------------------ |
| `TODO-NNN` | an entry in `work/todo/` |
| `DEBT-NNN` | an entry in `work/debt/` |
| `FLOW-NNN` | an entry in `work/flow/` |
| `gh#NN`    | a GitHub issue or PR     |
| `TRI-NNN`  | a spec rule (below)      |

`#NNN` is never used for an entry: GitHub turns it into a link to PR NNN.

### Entries — one file each (owner, 2026-10-10)

- An entry is one file named by its id, in the folder of its kind
  (`docs/work/{todo,debt,flow}/<id>.md`). Its first line is its heading; `just rule-homes`
  fails when the name, the folder and the heading do not say the same id.
- An entry that ships is deleted (`just queue close <id>`), so two pull requests
  never meet in a file when each closes or files an entry.
- Ids are permanent and never reused: `just queue next-id <TODO|DEBT|FLOW>` prints
  the next free one, counting the entries already deleted. Two branches that take the
  same id conflict at the merge; the later one takes the next id.
- `/plan-queue` adds one `Refined (<date>)` line, beyond those its kind requires, to an
  entry it proposes: the code read and its Done when (a todo's in its Done when line).

### Filing an entry (owner, 2026-10-11)

`/file-entry` is the checklist of what follows.

- **Three kinds, no fourth** (owner, 2026-10-17). A todo is what a user will see (a `feat`
  or a `fix`); a debt, what a user will not (`refactor`, `chore` on the application); a flow
  entry, how the work moves (guides, `scripts/`, `justfile`, hooks, workflows). A bug takes
  its fix's kind. A spec, contract, glossary, ADR or `ARCHITECTURE.md` drifting from right
  code is a debt gated "when next touched", alone only when it blocks something.
- **One command creates an entry**, never a hand-written file:
  `just queue new <todo|debt|flow> "<title>"` gives it the next id, the date and the
  required lines of its kind. `just rule-homes` fails on an entry that lacks one.
- **What an entry carries when filed:** its evidence (what was seen, where, with a
  figure or a pull request), one observation only, its size, and whether it waits on
  the owner and for what — a debt's `Waits on the owner` line, a todo's open questions,
  a flow entry's missing `Decision` line.
- **Size**, by facts and not by effort — **S**: one pull request, one layer, nothing
  from the owner; **M**: any other single pull request — several lanes, a spec or a
  contract, an answer from the owner; **L**: two or three pull requests, or mocks or a
  spec interview with the owner; **XL**: a programme, which cannot be queued before it
  is sliced. The agent sets it on a debt or a flow entry; on a todo entry
  `/plan-queue` proposes it and the owner confirms it with the entry.
- **Who files.** The agent files every kind: a todo when user-facing and needed, carrying
  the open question "The owner confirms this entry" until the owner confirms its User value.
- **A GitHub issue is never worked directly:** it becomes a todo, a debt or a flow
  entry first, which names it (`gh#NN`), and the pull request that ships the entry
  closes the issue. A Dependabot pull request is not an issue: it is queued under its
  own number.
- **The filing branch** is `docs/file-<slug>` (`docs/queue-<date>` while planning, a work
  branch if the owner asks): an entry's id leads a slug only on the branch that works it
  (`chore/flow-048-…`), the only branch the audit counts as its work.
- **A bug is always filed**, even when it is fixed in the same session: a first pull
  request files its entry, the fix closes it, so the fix's branch and tests carry its
  id and an id is never given twice. A request in chat that is not a bug still needs no
  entry: the pull request is its record.

### Todo entries — shared

- Every entry is `# TODO-NNN — title`, carries `**Size:**` and ends with
  `**User value:**`, `**Done when:**`, `**Design:**` and `**Open questions:**`.
- The agent writes `Design` and the open questions and proposes the size; it does not
  change without asking what the owner confirmed (User value, Done when, the decision to
  queue). `/plan-queue` adds its `Refined` text to the Done when line.

### The queue — `docs/work/queue.md`, human-owned (owner, 2026-10-10)

- The file is the queue of one batch: `TODO-NNN`, `DEBT-NNN` and `FLOW-NNN` references,
  and `gh#NN` for a Dependabot pull request (§ Conventions), in the order to work them,
  one per line as a plain list (`- TODO-NNN`).
- It is written once per batch, in `/plan-queue`, in chat, as the order the human
  validated; every reference names an existing entry or an open pull request. No pull
  request that ships an entry edits it, so entries of every kind alternate in the queue
  without two closures meeting in the file. A cut during a batch is an edit the human
  validates; the audit's pull request empties the list and its notes (§ 12).
- A queued reference whose entry file is gone has shipped: `just queue` shows what
  shipped and what remains. The agent takes the first remaining reference that is
  **ready**.
- A queue is sized by its work, not by its number of entries (owner, 2026-10-06 and
  2026-10-11): `/plan-queue` sums the sizes of what it proposes — `just queue` prints
  the sum — and stops at what the last batches merged (`docs/work/audits.md`), saying
  both figures. An entry whose Done when is a programme — several features, "split per",
  "every … in" — enters as its first slice, written as a note in the queue file and a
  line in the entry.
- **Ready** means: queued, a Done when is written, `Open questions: none`, and
  `Design` is `none` or `validated`.
- **The order `/plan-queue` proposes** (owner, 2026-10-11): what changes the tools
  first; a dependency before what depends on it; entries that touch the same files next
  to each other, so one can be prepared on the other; small fixes a user notices early;
  what needs the owner flagged at the top. Where two of these disagree, the proposal
  says so in one line. Each line gives the id and a concise summary of the task, with at
  most a clause on why it sits there; what needs the owner and what is left out come below.
- **Nothing open is passed over** (owner, 2026-10-11): `just queue` prints every open
  GitHub issue no entry names yet and every open Dependabot pull request not queued.
  Each is queued — an issue through its entry, a Dependabot pull request under its
  number — or named as left out with its reason.

### Debt entries — agent-owned

- Every entry is `# YYYY-MM-DD — DEBT-NNN — title`. Its body is five lines —
  `**Found by:**`, `**Where:**` (paths from the repository root), `**Observation:**`,
  `**Size:**` and `**Waits on the owner:**` (`no`, or for what).
- The agent files here: reviewer findings it did not fix, smells met on the way,
  proposals for new work, coverage holes, frozen architecture debt.
- Entries are observations, not commitments. The human promotes one by queuing its
  `DEBT-NNN`; `/plan-queue` proposes debt entries beside todo entries.
- An entry may carry its own gate ("when next touched", "not as a sweep", "when a third
  consumer appears"). Read the whole entry before proposing or working it: the gate is
  honoured, or the override is put to the human — never swept silently.

## 3. The loop — one run, one task

A task — a queued entry (`/run-entry`, headless), an entry the human names, or a chat
request (its record is the pull request body) — lands on `main` through the **ceremony**:
here a pull request, every check green, merged by `just merge` (steps 8–10).

1. **Pick and brief.** In chat, a question to the human goes through `AskUserQuestion`,
   one per call (owner, 2026-10-17): what happened, what each option changes and costs,
   the recommended one first; no status message repeats it, and the next waits for its
   answer. Headless, a question is written into the entry and the run moves on.
   - **The questions come before the work — the decision scan** (owner, 2026-10-06):
     the agent reads the entry and the code it names, lists every choice that is the
     owner's — what a user sees, a term, a rule's scope, where a programme stops — and asks
     each once and at its widest, writing the answers into the entry. `/plan-queue` runs it
     while refining, leaving what a user sees (§ 4) and the code to the run, which asks
     what is still open before its branch exists.
   - A choice with a standing answer is not asked: when one option keeps what a user
     sees today, it is taken and stated in the pull request; a release-sweep finding
     that is not critical and predates the batch is filed and reported (Conventions).
   - **Banked** (owner, 2026-10-11, 2026-10-12): a question is asked alone, with its
     context, only where the options differ in cost, risk or what is seen — an ambiguity
     or a deep choice; a trivial one is the agent's. A flow entry's proposal so answered
     is recorded as accepted ("banked" on its Decision line, § 12) and reported in one line.
   - Each queued size is checked against the code the entry names and corrected on the
     entry before the branch (a todo's as an open question); one that changes during the
     work is written before closure.
   - During the work, a question remains right for what that reading could not show — a
     reviewer's finding, a failing machine, a behaviour found in the code — and the
     agent asks rather than guess, for a spec point as for a vocabulary term.
   - For an entry with a spec the order is: spec draft, `spec-reviewer`, then the
     questions, new vocabulary included, so a decision is taken once, knowing its
     consequences.

   The opening brief states Task, Scope, Design, Touching. Branch
   `<type>/todo-NNN-slug`, `<type>/debt-NNN-slug`, or `<type>/slug` off a fresh `main`,
   where `<type>` is the commit type the change will carry.

2. **Design gate** (§ 4) for anything the user sees.
3. **Acceptance first.** Each Done-when clause becomes a failing test: Rust for logic,
   Vitest for rendering, E2E for what a user does. Test names carry the entry id or the
   spec rule. A new business rule goes into `docs/spec/<feature>.md` in the same commit;
   a new or changed command updates `docs/contracts/<domain>-contract.md`. Confirm red.
   - **A fault met in production** (owner, 2026-10-11): the input that shows it is asked
     for before any fix is designed — a log says what failed, not why — and a failing
     test that reproduces it is the acceptance test of the fix. When the input holds
     patient data, the agent says what it needs from it and how little.
4. **Implement** to green, the right way (§ 6).
5. **Self-check:** `just harness` (§ 5).
6. **Self-review:** the reviewer lanes the diff needs (§ 7), again on the fixes until no
   🔴 remains.
7. **Evidence:** `/visual-proof` for every changed component.
8. **PR**, opened for the record, not for approval. Body under 20 lines: the task, each
   Done-when clause with the test that proves it and where that test was seen red (or
   why it could not be), findings that changed something, techdebt filed, screenshots.
9. **Merge:** `just watch-pr` waits for the checks; each lane's newest comment, green or
   not, is read and its findings graded (§ 7); then `just merge` — it refuses until every
   check is green and folds `fixup!` commits, so the task lands as one commit.
10. **Closure** in the same PR: on an entry that touched a spec, `spec-checker` runs
    first and what it finds is fixed; what the task met and did not fix is filed; then
    `just queue close <id>` deletes the entry's file (the queue left as written); techdebt
    updated; `ARCHITECTURE.md` if a module appeared, the spec if a rule changed. The closing
    brief says what changed for the user and what the project gained.

**Ending a batch** (owner, 2026-10-17) — every batch ends alike: the closing brief, then
`/dep-audit` and the release sweep (Conventions), what they find filed as debt; a security
issue that puts users at risk is a `fix` instead: a todo put to the owner, worked before
the batch ends, swept again on what it changed, released. A batch with a `feat` or `fix` is released: the
agent says it is ready; the human runs `just release`; CI builds the draft, which the
agent publishes once the release workflow and `main` are green, stopping on red. Any other
batch the agent closes with `just batch-end` (a `batch/<date>` tag): it publishes nothing,
its chores ride in the next release, no fix is picked to fill a changelog. `/flow-audit`
audits the range it closes (§ 12). A batch is named by its dates, never a version number.

## 4. Design proposal

Before **any** change to what the user sees — a new screen, a moved or added control, a
changed layout or wording pattern — the agent renders mocks of the target state with
the real components and tokens (`/design-proposal`):
`screenshots/design/{id}-{light|dark}-{state}.png` plus a five-line note (what moves,
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
unit tests never run in a hook (hooks export `GIT_DIR`). Nothing is run by hand just
before a commit or a push: the hooks do it, and `just harness` is for wanting CI's
answer before pushing.

- **Lint, format, types, build** — `scripts/check.py`, every PR.
- **Core without the desktop shell** — `scripts/core-without-tauri.sh`, when the backend
  changes: the crate builds with no Tauri dependency (B47).
- **Architecture rules A1–A8, B18, B24** — `scripts/arch-check.py`; today's debt is frozen in
  `arch-allowlist.json` and may only shrink.
- **Doc map and rule homes** — `scripts/rule-homes.py`: every Markdown file in a
  location of `docs/README.md`, every rule, entry and lesson ID defined once.
- **Guide ceilings** (owner, 2026-10-11) — the guides are `CLAUDE.md`, this document,
  `docs/agentic-setup.md`, the rules docs and every prompt. The same script fails when
  one grows past the length `guide-ceilings.json` records for it, or when a skill or
  agent prompt with no recorded ceiling holds more than 120 lines. A ceiling is lowered
  as its guide shrinks (`just rule-homes --lower-ceilings`); raising one, or recording
  one above 120 for a new prompt, is the owner's yes, named in the pull request.
- **Tests with coverage** — Vitest and `cargo llvm-cov`, for the layers a PR touches;
  pushes to `main` run both.
- **Coverage floors** — `scripts/coverage-gate.py` + `coverage-gates.json`, logic code
  only; a ratchet, never lowered. A gap is closed with tests on real branches. A file
  leaves the measure only when it is generated or holds no logic, never to reach a
  number: an honest lower figure on untested pass-through code is accepted.
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
- **Logic in Rust, the frontend renders.** A business rule, a validation, an
  aggregation or a derivation is a Rust command with its Rust tests, so every surface
  (the window, the command line, an MCP server) follows the same rule. The frontend
  renders, holds ephemeral UI state and maps error codes to translations. Rule A8
  freezes the logic files that remain in `src/features/`; the list only shrinks.
- **Typed errors** on the wire (`docs/error-model.md`); factories and aggregate-root
  methods on domain objects.
- **Stable ids** on every interactive element; text from i18n.
- **Ubiquitous language** in every identifier (`docs/ubiquitous-language.md`).
- **No patient data** in logs, commits, fixtures or PR text.
- **Surgical:** touch the file set the task needs; boyscout inside it, never beyond.
- **Read the gold first.** Before changing a pattern that has a named reference (the
  `bank-account` feature, B0, the error model), open and read it; if it contradicts
  the design in mind, the gold wins.
- **Check the ADRs before writing "cannot".** Before stating that something cannot be
  done, tested or automated, grep `docs/adr/`: a solved constraint is recorded there.
- **A moved or removed symbol** is searched by its bare name and by every `pub use`
  that re-exports it, not by its canonical path alone (lesson TL-006).

## 7. Reviewers and the triage policy

Before the PR, run exactly the lanes
`bash scripts/branch.sh files | bash scripts/review-lanes.sh` prints — none for a change
to documents that are not guides — and again on the fixes until no 🔴 remains. CI runs
the same lanes on every push as the last net, with the prompts taken from `main`. A local reviewer is given the branch, the
spec and the vocabulary, never a description of the change: a brief that explains the
change steers the read, and CI then finds what the same lane missed. Criticals that only
CI found are counted at the audit (§ 12). Also: `spec-reviewer` / `contract-reviewer` /
`adr-reviewer` when those documents change, `spec-checker` before closing an entry that
carries spec rules. The guides (§ 5) have a lane of their own, `reviewer-guides`.

Every finding, local or from CI, is graded before any is applied; one line per finding that
changed something or was rejected goes in the PR body, or in a PR comment once pushed:

- **(a)** in scope → fix in the PR.
- **(b)** bigger, or outside the file set → `DEBT-NNN` entry, linked from that line.
- **(c)** is never "pre-existing" alone: a rejection cites what overrides the finding —
  a rule, a file, an ADR, a measurement, the owner's decision.
- **(c) one-off** false positive → inline comment `<reviewer> FP: <reason> — see PR #NN`.
- **(c) pattern** → a "not a finding" rule in the reviewer's prompt, same PR.
- **A CI finding the local run missed** → a rule in that reviewer's prompt, same PR.
- **`[DECISION]`** → see Conventions below.
- **A 🔴 security finding on the agent's own change** is fixed, or put to the human with
  its options. The agent never clears it with a "not a finding" rule it writes itself:
  that would soften the gate that grades its own work.
- **A 🔴 security finding that already exists on `main`**, outside the task: shown to the
  human with that context and three options — file it as debt and ship the scoped
  change (the default), widen this pull request, or block. Never deferred silently. A
  finding the pull request introduces blocks.

## 8. Budget and stop rules

- One task, one run, three hours of wall clock; a wait for the CI account's usage limit
  to reset (`just watch-pr` exit 6) is not the task's time. Over budget → open question
  "larger than estimated: split?", stop.
- A gate fails → read its log. If the log shows the cause, fix it. If it does not, the
  next push adds observation and makes the failure cheap to reproduce (the cache kept
  on failure, a stop at the first failing file), never a fix. This holds from the first
  failure, for every gate.
- The same gate failing three times on one task → open question, stop (a trivial one is
  the agent's, § 3).
- An E2E failure that passes on re-run → the flake is filed as `DEBT-NNN`, the run
  continues.
- **Never:** what `CLAUDE.md` § Core rules 1 forbids; nor change the queue without the
  human's yes (§ 2), nor edit `.claude/settings.json` (the human edits it; the agent
  commits that edit through a pull request).

## 9. Where the loop runs

The chat session is for writing entries together, design conversations and answering
open questions. The loop runs one task per run and keeps its state in git and the entries.

- **In chat:** `/run-entry TODO-NNN`, or a plain request; `/run-queue` for a whole batch:
  the questions first, each remaining entry through `/run-entry`, the batch's end
  (§ 3), then `/flow-audit`.
- **Laptop:** `just run-entry` — one ready entry, headless, three hours of budget; a
  command outside the allow list in `.claude/settings.json` is denied, so the run fails
  instead of waiting.
- **Cloud routine** on claude.ai, created disabled; the human switches it on.

---

## 10. Gold for new code, bit by bit for existing

Three golds: the backend layout (`backend-rules.md` B0, B37–B43), the frontend layout
(`frontend-rules.md` F0, F26–F28; reference feature `bank-account`) and the error model
(`error-model.md`). New code follows them. Existing code touched by a task is made
conformant in the same PR only when all three hold:

- **Size** — at most about 50 lines of conformance changes.
- **Locality** — inside the files the task already touches.
- **Mechanical** — a rename, an import, a signature or type swap; any design judgement
  (which layer, what name) defers it.

Otherwise the touched code keeps its current standard; a mixed codebase is fine, a
half-migrated file is not. The deciding test is **two stories**: if a reviewer would
read the PR as the task plus a migration, the migration is a separate entry.

## 11. PR size and split

One story per pull request. The target is about 400 hand-written lines per reviewer
lane; above about 800 in a lane, split. Generated files, lockfiles, screenshots and spec
documents are not counted, and the total has no limit: a mechanical change that one
check proves is one story whatever its size. The 400 is the figure measured on human
reviewers; each audit (§ 12) checks it against what CI found that the local lanes
missed. A feature whose backend or frontend exceeds about 20 files or 500
lines ships as one PR per layer, in order: spec, contract, migration, backend and
bindings; then the frontend; then E2E and closure. Each is mergeable on its own.

While a pull request waits for its checks, the next task may be prepared on a branch
not pushed yet, so pull requests that change the same file do not conflict: its harness
and reviewers run there, the reviewers given its last commit only, and it is rebased
onto `main` before its first push — a local rebase, never a force-push.

## 12. The flow audit

After a batch ends (§ 3), `/flow-audit` audits it into `docs/work/audits.md`, once:
quality first, weighed against speed and effort. Nothing of it runs during a batch.

- **An auditor of its own** (owner, 2026-10-11) — `flow-auditor`, read-only, with a
  fresh context, judges and returns the findings from the figures, the batch's pull
  requests and the entries filed during it — never the session agent's account, whose
  answers to its questions are evidence. What it cannot rebuild from those records is a
  finding; what lives only in a conversation leaves the audit: the questions put to the
  owner are the dated answers in the entries.
- **Measures** — `just flow-audit` counts every figure beside the batch before: the
  pull requests, the queue, the entries, CI, the usage log, dead paths, the guides'
  length (§ 5), what each entry took beside its size. The auditor counts from the pull
  requests what the reviewers caught, got wrong and left to CI, and reads each generic
  piece of `docs/agentic-setup.md` against its line.
- **Six questions** (owner, 2026-10-10, 2026-10-11), asked of every batch: what would have
  avoided a conflict; where it waited, and what would shorten it without costing quality;
  what can be simplified; which script, recipe, skill or agent went unused (keep, fold or
  remove); where a guide was false, contradicted another, or grew without earning it; what
  was done by hand that a tool should do, and which finding belongs to another repository.
- **Hard points** — every difficulty met becomes a `FLOW-NNN` entry with its evidence
  and a proposal; where nothing should change, the entry says keep and why.
- **Moves** — a todo or debt entry that is about the flow becomes a flow entry and keeps
  its old id in its title.

A flow entry is `# FLOW-NNN — title` and a list (owner, 2026-10-04): `Kind` (quality,
speed or effort), `Size` (§ 2), `Observed` with its evidence — a count, a duration, a pull request —
then a `Proposal` with what it `Costs` and what it `Protects`. A change that buys speed
says what it risks; one that buys safety says what it costs. A tool nobody used is named,
with a verdict: keep, fold or remove.

The human decides each entry, or has banked it (§ 3): a `Decision (owner, date)` line
makes it workable and it can be queued (§ 2); a `Watch (owner, date)` line marks one with nothing to do but
re-check. An entry is deleted once done, or once the verdict is to keep things as they
are.

## Conventions

### Spec rule numbering (TRIGRAM-NNN)

The scheme and the registered trigrams live in [`spec-index.md`](spec-index.md).

### `[DECISION]` criticals

A reviewer critical tagged `[DECISION]` needs an architectural choice, not a mechanical
fix. It is never fixed unilaterally: it becomes an open question on the entry, or goes
to the human in chat, and the PR stays open. Once the choice is made, record it with
`/adr-writer` → `adr-reviewer` in `docs/adr/` before applying the fix.

### Reviewer reports

Locally a reviewer's reply is its report; nothing is written. In CI the reviewer saves
its output to `.review/{slug}-{date}-{NN}.md` (`bash scripts/review-path.sh {slug}`) and
the workflow posts it as a new pull request comment each round. `.review/` is gitignored
and safe to delete.

### Dependabot pull requests

`review.yml` skips every lane for Dependabot (its runs get no secrets), so the green
reviewer checks of such a pull request are skips, not reviews. It is handled like an
entry: `/plan-queue` lists the open ones and proposes each for the queue as `gh#NN`;
the human orders it with the rest. Once queued, the agent:

1. reads the diff, and checks each pinned commit against the upstream tag it names;
2. checks out the branch and runs `just merge`: the rebase and push are the agent's,
   so CI runs the reviewers for real, and the merge stops until they have;
3. reads that review, grades every finding (§ 7) — a warning is not merged past;
4. runs `just merge` again on the Dependabot branch once every check is green. Its
   reference in the queue reads as done once the pull request is no longer open.

### Tools the flow needs, and the usage log

A tool the flow needs is added for good — a script under `scripts/` with its tests, a
recipe in the `justfile` — never rewritten in a session's scratch folder. Each is
judged again at the audit that follows a batch: keep, fold or remove.

The audit reads `logs/usage.log`: one line per run of a script or a recipe (time, tool,
duration, result), written by `scripts/usage_log.py`. The file is local, never
committed, capped at 5 000 lines, and emptied once its figures are in `docs/work/audits.md`.
A new script logs itself (`usage_log.start()` in Python, `. scripts/usage-log.sh` in
shell; a script that only CI runs does not); a recipe that runs no script depends on `(_used "<recipe>")`. Nothing is
logged in CI. Skills and agents are counted from the session transcript.

### Shell calls

A headless run has nobody to approve a command, so every shell call is one command the
allow list in `.claude/settings.json` names:

- no `cd … &&`, no `&&`, `||`, `;` or `$(...)` chain, in a prompt as in a call (the
  allow list matches a literal prefix): `git -C <path>` reaches another directory, a
  multi-line edit goes through `python3 - <<'EOF'`, more logic into a script by name;
- a message or a body goes in a file (`gh pr create --body-file`), never on the command
  line;
- calls that depend on each other run one after another, never in one parallel batch:
  the first failure cancels the rest;
- an empty result is read as a result, not probed again with `echo` or `pwd`;
- a command whose text names the installed application's identifier is refused by the
  deny list, even a `grep`: search for it with the search tool, and read paths and log
  formats from the source;
- a command the list lacks is named to the human, who adds it; the agent does not.

### Release sweep

Before a batch ends (§ 3), run the reviewer agents in `release-sweep` mode with `/dep-audit`,
and `spec-checker` on every spec the batch touched. `reviewer-security` reads the whole
command surface; every other lane reads what changed since the last batch end's tag
(owner, 2026-10-11; the review protocol says how to find it); the sweep's pull request
repeats each lane's `## Files read`. What they find is filed as `DEBT-NNN`, not fixed in
the batch, but for § 3's user-risk case; one not critical and older than the batch is
filed and reported, not asked (§ 7 keeps a 🔴 security finding for the owner).
