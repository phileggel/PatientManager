# Workflow — the human sets expectations, the harness holds the line

How work moves from a request or `docs/todo.md` to a release, and the conventions the
agents and skills rely on. This document is the rule set; git history records how it
was built.

## 1. Who owns what

- **Human** — `docs/todo.md`: what is worth doing, its user value, its done-when, and
  the **Next** queue.
- **Human** — validating a **design** before anything the user sees changes.
- **Human** — cutting a **release**; several merged branches may wait for one.
- **Agent** — `docs/techdebt.md`: every observation, smell and proposal about the code.
  The human queues from it.
- **Agent** — `docs/flow.md`: the same about the workflow itself (checks, waits, tools,
  the human's part), audited after each release (§ 12).
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
| `FLOW-NNN` | an entry in flow.md     |
| `gh#NN`    | a GitHub issue or PR    |
| `TRI-NNN`  | a spec rule (below)     |

`#NNN` is never used for an entry: GitHub turns it into a link to PR NNN.

### `docs/todo.md` — human-owned

- `## Next` at the top holds the queue: `TODO-NNN`, `DEBT-NNN` and `FLOW-NNN` references, and `gh#NN` for a Dependabot pull request (§ Conventions), in the
  order to work them, one per line as a plain list (`- TODO-NNN`; no numbers, so
  pull requests that each close an entry do not conflict). The agent takes the first **ready** one and removes a reference
  only in the PR that ships its entry. It adds to or reorders the list only in
  `/whats-next`, in chat, writing the order the human validated.
- Every entry is `## TODO-NNN — title` and ends with `**User value:**`,
  `**Done when:**`, `**Design:**` and `**Open questions:**`.
- **Ready** means: queued, a Done when is written, `Open questions: none`, and
  `Design` is `none` or `validated`.
- The agent writes to this file in four places only: it sets `Design` to
  `proposed (…)` or `validated`, it adds open questions, it removes an entry in the
  pull request that ships it, together with its reference in `## Next`, and in
  `/whats-next` it writes the queue and the User value and Done when the human
  validated in chat. It never creates, renumbers or reorders entries.

### `docs/techdebt.md` — agent-owned

- Every entry carries a permanent id: `## YYYY-MM-DD — DEBT-NNN — title`. Numbers are
  never reused. Its body is three lines — `**Found by:**`, `**Where:**` (paths from the
  repository root) and `**Observation:**` — and the newest entry goes first.
- The agent files here: reviewer findings it did not fix, smells met on the way,
  proposals for new work, coverage holes, frozen architecture debt.
- Entries are observations, not commitments. The human promotes one by queuing its
  `DEBT-NNN` in Next; `/whats-next` proposes debt entries beside todo entries.
- An entry may carry its own gate ("when next touched", "not as a sweep", "when a third
  consumer appears"). Read the whole entry before proposing or working it: the gate is
  honoured, or the override is put to the human — never swept silently.

## 3. The loop — one run, one task

A task is a queued entry (`/next-todo`, headless), an entry the human names
(`/next-todo TODO-NNN`), or a request typed in chat ("do X"). A chat request leaves no
todo entry: the pull request body is its record.

1. **Pick and brief.** In chat, a question to the human is asked alone, with the context
   to answer it cold — what happened, what each option changes, what it costs — and the
   next one waits for the answer. The agent asks during the work rather than guess, for
   a spec point as for a vocabulary term. For an entry with a spec the order is: spec
   draft, `spec-reviewer`, then the questions, new vocabulary included, so a decision is
   taken once, knowing its consequences. Headless, a question is written into the entry
   and the run moves on. The opening
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
9. **Merge:** `just watch-pr` waits for the checks and says how they ended; then
   `just merge` — it refuses until every check is green and folds `fixup!` commits, so
   the task lands as one commit.
10. **Closure** in the same PR: `just whats-next close <id>` removes the entry from
    `docs/todo.md`, `docs/techdebt.md` or `docs/flow.md`, and its reference from `## Next`; techdebt updated;
    `ARCHITECTURE.md` if a module appeared, the spec if a rule changed. The closing
    brief says what changed for the user and what the project gained.

**Release** — the agent prepares it: `/dep-audit` and the release sweep (Conventions),
what they find filed as debt, and only then does it tell the human the release is
ready. The human runs `just release` when they choose. It computes the version from
the merged titles, writes the changelog (only `feat` → Added, `fix` → Fixed) and the
version files, tags and pushes; CI builds the draft and puts the version's changelog
section in its notes. The agent publishes the draft once the release workflow and
`main` are green, and stops if anything is red.

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
- **Architecture rules A1–A7, B18, B24** — `scripts/arch-check.py`; today's debt is frozen in
  `arch-allowlist.json` and may only shrink.
- **Doc map and rule homes** — `scripts/rule-homes.py`: every Markdown file in a
  location of `docs/README.md`, every rule, entry and lesson ID defined once.
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
`bash scripts/branch.sh files | bash scripts/review-lanes.sh` prints — none for a
docs-only change — and again on the fixes until no 🔴 remains. CI runs the same lanes
on every push as the last net, with the prompts taken from `main`. A local reviewer is
given the branch, the spec and the vocabulary, never a description of the change: a
brief that explains the change steers the read, and CI then finds what the same lane
missed. Criticals that only CI found are counted at the audit (§ 12). Also:
`spec-reviewer` / `contract-reviewer` / `adr-reviewer` when those documents change,
`spec-checker` before closing an entry that carries spec rules.

Every finding, local or from CI, is graded before any is applied, and the outcome is
recorded in the PR body, one line per finding that changed something or was rejected:

- **(a)** in scope → fix in the PR.
- **(b)** bigger, or outside the file set → `DEBT-NNN` entry, linked from the PR body.
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

- One task, one run, three hours of wall clock. Over budget → open question "larger
  than estimated: split?", stop.
- A gate fails → read its log. If the log shows the cause, fix it. If it does not, the
  next push adds observation and makes the failure cheap to reproduce (the cache kept
  on failure, a stop at the first failing file), never a fix. This holds from the first
  failure, for every gate.
- The same gate failing three times on one task → open question, stop.
- An E2E failure that passes on re-run → the flake is filed as `DEBT-NNN`, the run
  continues.
- **Never:** touch the installed application's data
  (`~/.local/share/com.projectsf.patient-manager/` holds real patient data), push to
  `main`, force-push, bypass a hook, edit a released changelog line, change Next
  without the human's yes (§ 2), cut a release, edit `.claude/settings.json` (the human
  edits it; the agent commits that edit through a pull request).

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

## 12. The flow audit

After a release and its cleanup, the agent audits the batch and writes the result in
`docs/flow.md`. Quality is the goal, weighed against speed and effort.

- **Measures** — pull requests merged, time from opening to merging, CI rounds, failed
  runs per workflow, what the reviewers caught, what they got wrong, and the criticals
  only CI found.
- **Tools** — which scripts, recipes, skills and agents ran, and which did not
  (`logs/usage.log`, the session transcript); each gets a verdict: keep, fold or remove.
- **Hard points** — every difficulty met becomes a `FLOW-NNN` entry with its evidence
  and a proposal; where nothing should change, the entry says keep and why.
- **Moves** — a todo or debt entry that is about the flow moves to `docs/flow.md`.

The human decides each entry; a decided entry can be queued (§ 2).

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
the workflow builds the pull request comment from that file. `.review/` is gitignored
and safe to delete.

### Authoring rule — no compound shell in agent / skill prompts

Bash blocks in `.claude/agents/*.md` and `.claude/skills/*/SKILL.md` must not use
command substitution (`$(...)`), `&&`, `||`, `;`, or `cd X && cmd` chains: the
permission allowlist matches a command by literal prefix, so a compound line prompts on
every run. Move the logic into a script under `scripts/` and call it by name; for a
multi-line payload, write a temp file and pass it (`gh pr create --body-file …`).

### Dependabot pull requests

`review.yml` skips every lane for Dependabot (its runs get no secrets), so the green
reviewer checks of such a pull request are skips, not reviews. It is handled like an
entry: `/whats-next` lists the open ones and proposes each for the queue as `gh#NN`;
the human orders it with the rest. Once queued, the agent:

1. reads the diff, and checks each pinned commit against the upstream tag it names;
2. checks out the branch and runs `just merge`: the rebase and push are the agent's,
   so CI runs the reviewers for real, and the merge stops until they have;
3. reads that review, grades every finding (§ 7) — a warning is not merged past;
4. removes the reference with `just whats-next close gh#NN` in a docs pull request of
   its own (the Dependabot branch is not the agent's to add commits to), then runs
   `just merge` again on the Dependabot branch once every check is green.

### Tools the flow needs, and the usage log

A tool the flow needs is added for good — a script under `scripts/` with its tests, a
recipe in the `justfile` — never rewritten in a session's scratch folder. Each is
judged again at the audit that follows a release: keep, fold or remove.

The audit reads `logs/usage.log`: one line per run of a script or a recipe (time, tool,
duration, result), written by `scripts/usage_log.py`. The file is local, never
committed, capped at 5 000 lines, and emptied once its figures are in `docs/flow.md`.
A new script logs itself (`usage_log.start()` in Python, `. scripts/usage-log.sh` in
shell; a script that only CI runs does not); a recipe that runs no script depends on `(_used "<recipe>")`. Nothing is
logged in CI. Skills and agents are counted from the session transcript.

### Shell calls

A headless run has nobody to approve a command, so every shell call is one command the
allow list in `.claude/settings.json` names:

- no `cd … &&`, no `&&` or `;` chain: `git -C <path>` or an absolute path reaches
  another directory; a multi-line edit goes through `python3 - <<'EOF'`;
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

Before a release, run the reviewer agents in `release-sweep` mode (the invoking prompt
contains `release-sweep`) alongside `/dep-audit`, and `spec-checker` on every spec the
batch touched. What they find is filed as `DEBT-NNN`, not fixed in the release.
