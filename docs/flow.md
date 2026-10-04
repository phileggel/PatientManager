# Flow

What the workflow owes the people and the agent who run it: how work moves, where it
waits, what a check costs and what it catches. `todo.md` says what the application owes
its user, `techdebt.md` what the code owes itself. Agent-owned, like `techdebt.md`.

How an entry is written (owner, 2026-10-04):

1. Quality is the goal; it is weighed against speed and effort. A change that buys speed
   says what it risks; a change that buys safety says what it costs.
2. An observation carries its evidence: a count, a duration, a pull request.
3. "Keep" is a verdict. Where nothing should change, the entry says so and why.
4. A tool nobody used is named, with a verdict: keep, fold, or remove.

Each entry has a permanent `FLOW-NNN` id (never reused; next free: FLOW-018). The owner
picks what to do; an entry is removed once settled. Entries that came from `techdebt.md`
keep their old id in the title.

---

## Measured — the 0.24.0 batch (2026-10-03 → 2026-10-04)

- **Pull requests merged:** 13 code and docs pull requests (#159–#172, without #171),
  about 6 300 lines added; #173 followed the release.
- **Opening to merging:** median 16 min, mean 57 min. One pull request (#161, Windows
  E2E) took 476 min; without it the mean is 22 min.
- **CI rounds:** 47 Quality runs for 23 branches. #161 took 11 rounds, #169 took 4,
  five others took 3.
- **Run times (median of green runs):** Quality 2.3 min, Review 2.5 min, E2E 6.1 min,
  release dry run 18.3 min. The release itself: 31 min.
- **Failed runs on pull requests:** Review 7 (on 5 pull requests), release dry run 6
  (all #161), Quality 0, E2E 0.
- **Defects reviewers caught before merge:** at least 11. Among them: a use case reading
  the database directly (B24), a use case imported by two others (B18), log lines that
  could carry a file name into the diagnostic report, a support code with one character
  drawn from half the alphabet, a CI grant that let a reviewer write anywhere, a release
  job that ran a downloaded driver unverified.
- **Wrong reviewer claims:** 3 ("the opener plugin is unused" twice; a `[DECISION]`
  critical against a pattern ADR-003 ratifies).
- **Agent launches in the session:** 114, all reviewers; every one of the 11 agents ran.

Reading: the reviewers paid for themselves, and the mechanical checks (Quality, E2E)
never failed on a pull request because the hooks and the local harness had already run.
The time went to three things: one CI-only failure diagnosed blind (FLOW-002), CI rounds
after a rebase that tested nothing new (FLOW-004), and findings CI made that the same
lane had missed locally (FLOW-001).

---

## FLOW-001 — The same lane finds in CI what it missed locally

- Kind: quality + speed
- Observed: 4 critical findings came from CI after the same lane had passed locally:
  B18 (#164), dependent `it()` blocks (#165), B24 (#166), an English string with a
  French label (#169). Each cost a fix, a push and a CI round; each time the missing
  check went into that reviewer's prompt.
- Likely cause, not proven: locally the agent writes the reviewer's brief and describes
  its own change, which steers the read; CI gives the lane the diff and nothing else.
- Proposal: launch a local reviewer with the branch, the spec and the vocabulary only —
  no summary of what the change does. Count CI-only criticals in the next batch; if the
  count does not fall, the local run is not worth its minute and CI alone reviews.
- Costs: nothing. Protects: one CI round (about 8 min) per miss.

## FLOW-002 — A CI-only failure was fixed blind three times

- Kind: speed
- Observed: the Windows E2E job failed with one error message. Three attempts changed
  something plausible and waited 40 min each. A step that started the app by hand and
  printed the webview's command line found the cause in four runs of 3 to 8 min
  (lesson TL-004).
- Proposal: add to the stop rules in `docs/workflow.md` § 8: when a gate fails a second
  time for a reason the log does not show, the next push adds observation, not a fix,
  and first makes the failure cheap (cache kept on failure, stop at the first failing
  file).
- Costs: one sentence. Protects: about two hours on the next blind failure.

## FLOW-003 — Rules only a reviewer enforces (from DEBT-023, DEBT-025)

- Kind: quality + speed
- Observed: B18 (a use case imports another) and B24 (sqlx outside a unit of work) are
  checked by `reviewer-arch` alone. Both slipped past the local run and were caught in
  CI. `just arch-check` runs in seconds and tests neither. Six existing files break the
  two rules (DEBT-023, DEBT-025 stay in `techdebt.md` for the code).
- Proposal: add both to `scripts/arch-check.py`, the six files frozen in the allowlist.
- Costs: about 40 lines and their tests. Protects: the pre-commit hook catches what took
  a CI round, and the reviewer stops being the only guard.

## FLOW-004 — A merge sends every open pull request round again

- Kind: speed
- Observed: #169 ran 4 rounds and #170 ran 2 for changes of 93 and 12 lines; #161 ran a
  last 18-min round after being green. `just merge` waives the round only when the
  rebase moved record files. Merges were held back by hand to avoid more rounds.
- Verdict: **keep, with one change.** The numbered queue forced closing pull requests to
  merge one at a time; #173 removes that. Add `docs/flow.md` to the record files (done
  with this file). A merge queue would rewrite `just merge` for a saving of minutes.
- Habit that worked: one code pull request in CI at a time, the next built locally on
  top of it and pushed after the merge.

## FLOW-005 — Skills nobody invoked

- Kind: effort
- Observed: of 13 skills, 4 were invoked (`/whats-next`, `/dep-audit`,
  `/design-proposal`, `/visual-proof`). The agent did the work of the others by hand.
- Verdicts:
  - `/spec-writer`, `/contract`, `/adr-writer` — **keep, and use.** Two specs, two
    contracts and one ADR were written by hand; the reviewers then raised 4 criticals on
    spec format and 1 on ADR format, which the skills' templates prevent.
  - `/techdebt` — **remove.** 9 entries written by hand with no finding on their form;
    the format is three lines in `docs/workflow.md`.
  - `/review-triage` — **fold into `docs/workflow.md` § 7** (FLOW-006).
  - `/next-todo` — **keep.** The batch ran in chat straight from `docs/workflow.md`;
    the skill is what the headless run reads.
  - `/session-reflect` — **remove.** This file and its audit replace it.
  - `/setup-e2e` — **remove.** One-time setup, done.
  - `/prune` — **owner's call.** Not used in this session; no evidence either way.
- Costs: the owner's decision. Protects: fewer prompts to keep true.

## FLOW-006 — The review report files and their triage skill are bypassed

- Kind: effort
- Observed: every finding was graded (a)/(b)/(c) in the pull request body, as § 7 asks.
  `/review-triage` was never invoked, and it reads `.review/` files that several
  local reviewers did not write ("report not saved"). `.review/` holds 167 files.
  The reviewer's answer in the session is the report the agent works from.
- Proposal: locally, the reviewer's answer is the report; drop the local write to
  `.review/`, `scripts/list-fresh-reviews.sh`, `scripts/report-path.sh` and the skill.
  CI keeps `scripts/review-path.sh`: its comment on the pull request is built from the
  file.
- Costs: a prompt edit in `review-protocol.md`. Protects: one less path that half works.

## FLOW-007 — Scripts and recipes nobody ran

- Kind: effort
- Observed in this session:
  - `scripts/build.sh` — referenced by nothing. **Remove.**
  - `scripts/collect-logs.sh`, `scripts/screenshot.sh`, `scripts/start-app.sh`,
    `scripts/preview-screenshot.mjs` and their recipes — reached only from the
    `justfile`, never run. `visual-proof-capture.mjs` does the screenshots.
  - Recipes `check-safe`, `release-safe`, `stat`, `clean-branches` — never run,
    referenced by no document.
- Verdict: **owner's call** for everything but `build.sh`: a recipe may be one the owner
  types by hand. Anything the owner does not use goes.

## FLOW-008 — A reviewer job that ends without a report (with DEBT-015)

- Kind: quality
- Observed: on #161 two CI reviewers ended with "no report" and "(no final message)";
  the log gave no cause, and a re-run passed. Separately (DEBT-015): on a fork pull
  request the step that posts the explanation fails on a raw `gh` error, because the
  token is read-only; the job has already failed closed.
- Proposal: `review.yml` prints the session's stop reason and last error when no report
  exists, and says "fork: no token" instead of calling `gh`.
- Costs: a few lines of workflow. Protects: a red check the agent can read instead of
  re-running.

## FLOW-009 — Specs are checked one at a time, at closure (DEBT-018)

- Kind: quality
- Observed: `spec-checker` ran twice in this batch, on the two specs being written, and
  found real gaps both times (an untested rule, a code whose spec said otherwise). The
  33 specs, contracts and ADRs written before have never been read against the code.
- Proposal: before a release, `spec-checker` runs on every spec the batch touched; its
  findings are filed as debt, not fixed in the release. The 33 older documents: one pass,
  as an entry the owner queues.
- Costs: one agent run per touched spec (about 2 min). Protects: the specs' claim to
  describe the application.

## FLOW-010 — The owner was asked twice about one decision

- Kind: quality + effort
- Observed: the question on merging two patients was asked before the spec review. The
  review then showed a consequence the question had not stated (the lost INS returns
  with the next import); the owner was asked again the next day, and the answer became a
  second pull request (#169). Three glossary terms also shipped as "proposed".
- Proposal: for an entry with a spec, the order is spec draft → `spec-reviewer` → one
  block of questions to the owner, each with its consequences, the new vocabulary in the
  same block.
- Costs: the questions come some minutes later. Protects: a decision taken once.

## FLOW-011 — What the agent does before asking for a release

- Kind: effort
- Observed: the agent told the owner to run `/dep-audit`; the owner asked why the agent
  had not. The owner also asked twice, in two releases, for the draft to be published
  once the jobs were green. `just release` leaves the version in `package-lock.json`
  behind (DEBT-029) and the release notes are one generic line.
- Proposal: `docs/workflow.md` says the agent runs `/dep-audit` and the
  `reviewer-security` release sweep, files what it finds, and only then asks for the
  release. Owner's call: whether the agent publishes the draft when the release workflow
  and `main` are green, without being asked each time. `scripts/release.py` also writes
  the lockfile version.
- Costs: one decision, a few lines. Protects: a release that waits on nobody's memory.

## FLOW-012 — The release dry run builds one platform after the other

- Kind: speed
- Observed: 18 min. Building Linux beside Windows would save about 7 min, on the few
  pull requests that touch the release workflows.
- Verdict: **keep.** GitHub cannot make a job dependency conditional, so the Linux build
  would move to a second reusable workflow, and its release path could only be proven by
  the next real release.

## FLOW-013 — The pull-request size target counts generated files

- Kind: effort
- Observed: #166, #167 and #168 are 1 263 to 1 721 lines against a target of 1 000.
  Query data, generated bindings, screenshots and the spec make up about a third.
- Proposal: the target counts hand-written code and tests only. No pull request in this
  batch would then have needed a note.
- Costs: one sentence in `docs/workflow.md` § 11. Protects: nothing but attention.

## FLOW-014 — Session helpers that disappear with the session

- Kind: effort
- Observed: two helpers written in the session's scratch folder were used about twenty
  times each: one that waits for a pull request's checks and prints failures, one that
  removes a closed entry and its queue line. The local `gh` lacks `pr checks --json`,
  `gh pr edit` fails on this repository, and the status poll hit several network
  errors.
- Proposal: both become scripts with tests (`scripts/watch-pr.sh`, a `close` mode in
  `scripts/whats-next.py`), the first one retrying on a network error.
- Costs: about 80 lines. Protects: each session rewriting them, slightly differently.

## FLOW-015 — The real-data folder is protected by a sentence only

- Kind: quality
- Observed: the agent read the real application's log folder once, to see a line format
  that was in the source. It returned nothing, and it should not have been possible.
- Proposal: a deny rule in `.claude/settings.json` on the folder's path. The agent cannot
  edit permission lists; the owner adds it.
- Costs: one line, by the owner. Protects: patient data from a careless command.

## FLOW-016 — The local harness before every push

- Kind: speed
- Observed: `just harness` ran before each code push (3 to 5 min) and CI's Quality ran
  the same checks again. No harness run failed on a defect in this batch: the hooks had
  caught what there was. Two runs overlapped an edit and proved nothing.
- Verdict: **keep for code, and re-measure.** It is the only local run of coverage and
  of the build. If the next batch again shows no failure the hooks had not caught, the
  harness becomes a tool for a doubt, not a step.

## FLOW-017 — A flow entry cannot be queued yet

- Kind: effort
- Observed: `scripts/whats-next.py` and `scripts/next-todo.sh` read `TODO-NNN` and
  `DEBT-NNN` only.
- Proposal: they read `FLOW-NNN` too, and `/whats-next` lists this file beside the debt.
- Costs: a regex and its tests. Protects: the owner queuing a flow change like any other.
