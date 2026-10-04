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

Each entry has a permanent `FLOW-NNN` id (never reused; next free: FLOW-026). The owner
picks what to do; a `Watch` line marks an entry with nothing to do but re-check; a decided entry carries a
`Decision` line and can be queued in
`docs/todo.md` § Next; an entry is removed once done, or once the verdict is to keep things
as they are (FLOW-004, FLOW-012 and FLOW-016 were closed that way on 2026-10-04; FLOW-017 and
FLOW-015 were done the same day). Entries that came from `techdebt.md`
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
- Decision (owner, 2026-10-04): a local reviewer gets the branch, the spec and the vocabulary, never a description of the change; CI-only criticals are counted in the next batch.

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
- Decision (owner, 2026-10-04): after any failure of a gate, read the log; if it shows the cause, fix it; if not, the next push adds observation and makes the failure cheap, never a fix. From the first failure, for every gate. Stop and ask stays at three.

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
- Decision (owner, 2026-10-04): remove `/techdebt`, `/session-reflect`, `/setup-e2e` and `/prune`; fold `/review-triage` into `docs/workflow.md` § 7; keep `/next-todo`; use `/spec-writer`, `/contract` and `/adr-writer` for every spec, contract and ADR.

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
- Decision (owner, 2026-10-04): as proposed, with FLOW-005.

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
- Decision (owner, 2026-10-04): remove `scripts/build.sh`, the `screenshot` and `preview-screenshot` recipes with their three scripts, `collect-logs` with its script, `check-safe` and `release-safe`. `stat` and `clean-branches` stay: the owner uses them.

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
- Decision (owner, 2026-10-04): print the stop reason and the last error, retry the reviewer once, and fail only if the second try also writes nothing.

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
- Decision (owner, 2026-10-04): before each release, `spec-checker` on every spec the batch touched; findings filed as debt. No pass over the older documents.

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
- Decision (owner, 2026-10-04): spec draft, then `spec-reviewer`, then the owner's questions — one at a time, each with its context and consequences, new vocabulary included. The agent asks during the work rather than guess.

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
- Decision (owner, 2026-10-04): the agent runs `/dep-audit` and the security release sweep before asking for a release; the owner cuts it; the agent publishes the draft when the release workflow and `main` are green, and stops if anything is red. `scripts/release.py` writes the lockfile version.

## FLOW-013 — The pull-request size target counts generated files

- Kind: effort
- Observed: #166, #167 and #168 are 1 263 to 1 721 lines against a target of 1 000.
  Query data, generated bindings, screenshots and the spec make up about a third.
- Proposal: the target counts hand-written code and tests only. No pull request in this
  batch would then have needed a note.
- Costs: one sentence in `docs/workflow.md` § 11. Protects: nothing but attention.
- Decision (owner, 2026-10-04): one story per pull request; a target of about 400 hand-written lines per reviewer lane, a split above about 800; generated files, lockfiles, screenshots and spec documents not counted; no limit on the total. The 400 is the figure measured on human reviewers (SmartBear at Cisco); nothing measured exists for agent reviewers, so the next audit checks it against what CI found.

## FLOW-018 — The release notes say nothing

- Kind: quality
- Observed: the published release reads "See the release assets to download and install
  this version"; `CHANGELOG.md` holds the real list. Whether the app's updater shows the
  notes to the user is not checked yet.
- Decision (owner, 2026-10-04): the release workflow puts the version's changelog section
  into the release notes; the notes of v0.24.0 are fixed by hand.

## FLOW-019 — The E2E tooling pulls advisories with no patched release (DEBT-019)

- Kind: quality
- Observed: `npm audit` reports 19 high advisories, all through `basic-ftp`, `braces` and
  `extract-zip` under `@wdio/*` 9.32. None ships in the app: `npm audit --omit=dev`, the
  weekly Security Audit gate, is clean. `braces` and `extract-zip` have no patched
  release; the only fix npm offers is a downgrade to WebdriverIO 5.
- Watch (owner, 2026-10-04): nothing to do until a fixed release exists; each `/dep-audit`
  before a release re-checks it and the agent reports when one does.

## FLOW-020 — Each E2E suite writes its own "open a management page" helper (DEBT-026)

- Kind: effort
- Observed: opening the management dialog and clicking a card is written again in
  `e2e/patient-duplicate/`, `e2e/bank-statement-label/`, `e2e/patient/`, `e2e/fund/` and
  `e2e/bank-account/`.
- Proposal: one helper in `e2e/helpers/` replaces the copies.
- Costs: one small pull request. Protects: a change of the dialog breaking five suites
  in five ways.
- Decision (owner, 2026-10-04): one shared helper in `e2e/helpers/`, used by the five suites.

## FLOW-021 — A CI reviewer read the base branch's skills as a revert

- Kind: quality
- Observed once, on gh#175: `reviewer-infra` raised two criticals saying two skill files
  had "uncommitted changes reverting the branch's own commit". The branch held the text.
  Likely cause, not confirmed: in CI the `.claude/` folder is the base branch's, so a
  pull request cannot soften its own reviewer, and the reviewer took that state for a
  revert. The next run did not repeat it.
- Watch (agent, 2026-10-04): if it comes back, `review-protocol.md` says that `.claude/`
  in CI is the base branch's by design and that the branch's version is read from the
  diff.

## FLOW-022 — Questions to the owner come one at a time, with their context

- Kind: quality
- Observed: `CLAUDE.md` and `docs/workflow.md` say that in chat "the open questions are
  asked together, once". In this batch a list of five "decisions for you" at the end of a
  summary got no answer, and a form of four questions got short answers; the same points
  asked one by one, each with what happened, what every option changes and what it costs,
  were all answered, two of them with a better rule than the one proposed (FLOW-002,
  FLOW-013).
- Decision (owner, 2026-10-04): a question to the owner is asked alone, with enough
  context to answer it cold, and the next one waits for the answer. The agent asks during
  the work rather than guess, for a spec point as for a vocabulary term. `CLAUDE.md` and
  `docs/workflow.md` are changed to say so. Headless is unchanged: a question becomes an
  open question on the entry.

## FLOW-023 — The flow audit is not a written step

- Kind: quality
- Observed: this file exists because the owner asked for an audit after the 0.24.0
  release. `docs/workflow.md` says only that the file is "audited at the end of a batch";
  what the audit reads, counts and produces is written nowhere but in the agent's private
  memory.
- Decision (owner, 2026-10-04): the audit becomes a step of `docs/workflow.md`, after a
  release and its cleanup. It measures the batch (pull requests, time to merge, CI rounds,
  failures per workflow, what reviewers caught and got wrong); says which scripts,
  recipes, skills and agents were used or not, each with keep, fold or remove; turns every
  hard point met into an entry; and moves here any todo or debt entry that is about the
  flow. Quality is the goal, weighed against speed and effort.

## FLOW-024 — Nobody reviews a Dependabot pull request, and nobody announces one

- Kind: quality
- Observed: gh#171 sat open through the session unnoticed. Its reviewer checks were
  green because `review.yml` skips every lane for Dependabot (its runs get no secrets): a
  skip, not a review. Checked out and passed through `just merge`, the branch is rebased
  and pushed by the agent, and CI then runs the reviewers for real; a warning they left
  was merged past.
- Decision (owner, 2026-10-04): a Dependabot pull request is handled like a GitHub issue.
  `/whats-next` lists the open ones and proposes each for the queue as `gh#NN`; the owner
  orders it with the rest. Once queued, the agent works it: it reads the diff, checks
  each pinned commit against the upstream tag, runs `just merge` to get a real review,
  reads that review, and merges. The queue and its readers accept `gh#NN`.
- Costs: about ten minutes per pull request. Protects: a dependency bump merged on checks
  that never ran, or left to rot.

## FLOW-025 — Rules that live only in the agent's private memory

- Kind: quality
- Observed: the agent keeps about forty notes outside the repository, most of them rules
  the owner gave in chat (how to brief a reviewer, never to pre-run checks, how to watch
  a pull request, what a commit title is). Five were added in this session alone: the
  release steps, the questions rule, this audit, how to work under the new deny rule on
  the data folder, how to handle a Dependabot pull request. A rule kept there binds one
  agent on one machine; a headless run, a CI reviewer or another session never sees it,
  and the owner cannot read or correct it.
- Decision (owner, 2026-10-04): a rule about how we work belongs in the repository. This
  file records it first; working the entry writes it into its home (`CLAUDE.md`,
  `docs/workflow.md` or a rules document). One pass goes through the existing notes: each
  becomes repository text, or is dropped as already said there, or stays private because
  it is about this machine only. From then on a new rule is written here in the same
  session it is given.
