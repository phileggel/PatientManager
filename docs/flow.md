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

Each entry has a permanent `FLOW-NNN` id (never reused; next free: FLOW-036). The owner
picks what to do; a `Watch` line marks an entry with nothing to do but re-check; a decided entry carries a
`Decision` line and can be queued in
`docs/todo.md` § Next; an entry is removed once done, or once the verdict is to keep things
as they are (FLOW-004, FLOW-012 and FLOW-016 were closed that way on 2026-10-04; FLOW-017 and
FLOW-015 were done the same day). Entries that came from `techdebt.md`
keep their old id in the title.

---

## Measured — the 0.24.1 batch (2026-10-04 → 2026-10-06)

- **Pull requests merged:** 33 (#173–#206; #185 closed and replaced), 4 909 lines added,
  3 158 removed. One session, three working stretches.
- **Opening to merging:** median 8 min (16 in the last batch), mean 75 min. The mean is
  three pull requests that waited overnight or through a GitHub Actions incident (#192
  506 min, #203 589 min, #202 647 min) and #201 (255 min, four watches — FLOW-028).
- **CI rounds:** 64 Quality runs for 35 branches. Two branches took 7, one took 4.
- **Run times (median of green runs):** Quality 2.6 min, Review 2.4 min, E2E 7.0 min.
- **Failed runs on pull requests:** Review 12, Quality 1, E2E 1, PR description 1, release
  dry run 1. Cancelled: 32, most of them on 2026-10-05 when jobs got no runner.
- **Agent launches:** 56, all prescribed reviewers (infra 17, arch 10, backend 10,
  frontend 6, security 5, contract 4, spec-checker 3, spec-reviewer 1). Not run locally:
  `reviewer-sql`, `reviewer-e2e`, `adr-reviewer` — no migration, E2E test or ADR changed.
- **Questions to the owner:** 14, one at a time. Skills run: `/whats-next` 1, `/next-todo`
  2, `/dep-audit` 1. Not run: `/design-proposal`, `/visual-proof`, `/spec-writer`,
  `/contract`, `/adr-writer` — nothing a user sees changed and no spec was written. Keep.
- **Tools:** every recipe and script in the usage log ran at least once
  (`logs/usage.log`, 792 lines). `watch-pr` 36 times, `merge` 27, `harness` 21. No tool
  to remove.
- **The queue:** 31 entries at its largest, on 2026-10-04; 9 moved to the next batch on
  2026-10-05, and TODO-016 closed on 3 of its 9 features on 2026-10-06 (FLOW-029).
- **Defects found before merge:** by reviewers, among others — a missing patient answered
  as a database error, a stored value with a stray space read as a change, two cascades
  the contracts promised and no command performs (DEBT-042), a rule the backend does not
  enforce (FPM-200). By the audits TODO-016 asked for — editing a patient saved an
  invalid SSN; editing a fund was not validated in Rust at all.
- **Wrong statements by the agent, corrected within the hour:** 4 (FLOW-033).

Reading: the mechanics held — a median of 8 minutes from opening to merging, and no tool
left unused. The time went elsewhere: to a queue twice the size of what a session does
(FLOW-029), to documents that had drifted and were paid for one feature at a time
(FLOW-032), and to an hour of watches during an outage (FLOW-028).

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

## FLOW-019 — The E2E tooling pulls advisories with no patched release (DEBT-019)

- Kind: quality
- Observed: `npm audit` reports 19 high advisories, all through `basic-ftp`, `braces` and
  `extract-zip` under `@wdio/*` 9.32. None ships in the app: `npm audit --omit=dev`, the
  weekly Security Audit gate, is clean. `braces` and `extract-zip` have no patched
  release; the only fix npm offers is a downgrade to WebdriverIO 5.
- Watch (owner, 2026-10-04): nothing to do until a fixed release exists; each `/dep-audit`
  before a release re-checks it and the agent reports when one does.
- Re-checked 2026-10-06 (`/dep-audit`, 0.24.1): a fixed release exists. WebdriverIO 10.0.0,
  published 2026-10-05, clears 18 of the 20 high advisories; `npm audit fix` clears the
  other two (`source-map-js`, and `esbuild`, low) without a major upgrade. What ships is
  still clean (`npm audit --omit=dev`, `cargo audit`).
- Proposal: owner's call for the next batch — `npm audit fix` now, WebdriverIO 10 once the
  major has a few weeks behind it; the E2E suites are its only user.

## FLOW-020 — Each E2E suite writes its own "open a management page" helper (DEBT-026)

- Kind: effort
- Observed: opening the management dialog and clicking a card is written again in
  `e2e/patient-duplicate/`, `e2e/bank-statement-label/`, `e2e/patient/`, `e2e/fund/` and
  `e2e/bank-account/`.
- Proposal: one helper in `e2e/helpers/` replaces the copies.
- Costs: one small pull request. Protects: a change of the dialog breaking five suites
  in five ways.
- Decision (owner, 2026-10-04): one shared helper in `e2e/helpers/`, used by the five suites.

## FLOW-026 — A rebase conflict on a pushed branch has no way through

- Kind: speed
- Observed: on 2026-10-04, gh#185 and gh#186 each removed an entry from `docs/flow.md`,
  two neighbouring blocks. Once gh#186 merged, `just merge` on gh#185 stopped on the
  conflict, as designed. Resolving it by hand rewrites the pushed commit, and the push
  that follows is a force-push, which the rules forbid; `just merge` itself may
  force-push after its own rebase, but refuses a branch rebased by hand. The way out was
  a new branch and a replacement pull request (gh#187): one more CI round, one closed
  pull request.
- Proposal: `just merge` takes the resolution: on a conflict limited to record files
  (`docs/todo.md`, `docs/techdebt.md`, `docs/flow.md`), it re-applies the entry removals
  with the `close` mode instead of stopping; any other conflict still stops.
- Costs: about 30 lines and their tests. Protects: one CI round and a duplicate pull
  request each time two closures touch neighbouring entries, which a bundle makes likely.

## FLOW-027 — The local harness runs both layers for a change to a script or a prompt

- Kind: speed
- Observed: on 2026-10-04, five pull requests that changed only `scripts/`, the
  `justfile` or a skill prompt each waited about 12 minutes for `just harness`: the
  frontend and backend suites with coverage, on code the change could not reach.
  `scripts/changed-scope.sh` classes tooling as "run both", the same rule as CI.
- Proposal: owner's call. Either keep it (a script such as `check.py` or `coverage-gate.py`
  does decide what the layers run), or narrow "run both" to the scripts the layer checks
  call, and let the others run the script tests only.
- Costs: a rule to keep in step between `changed-scope.sh` and `quality.yml`. Protects:
  about 10 minutes per tooling pull request.

## FLOW-028 — `just watch-pr` ends on a cancelled job that only needs a re-run

- Kind: speed
- Observed: on 2026-10-05, PR #201 took four watches. Editing the pull request's
  description restarted the workflows listening to it and cancelled runs in progress;
  later a job was cancelled after 15 minutes in the queue, no runner having taken it
  (zero steps). The watch reported each as a failure and stopped; nothing restarted the
  jobs until `gh run rerun <run> --failed`.
- Again on 2026-10-05 and 06, during a GitHub Actions incident: #202 and #203 took three
  watches each, every job cancelled after 15 minutes without a runner.
- Proposal: owner's call. `watch-pr` re-runs once a job that was cancelled without
  running a step, and says so; a job that fails after running is still a failure. The
  description is edited before the push, not after, when the review outcome is known.
- Costs: a watch that writes to GitHub (a re-run), where today it only reads. Protects:
  about 20 minutes and three manual re-runs on such a pull request.

## FLOW-029 — The queue was sized by its number of entries, not by its work

- Kind: quality
- Observed: the queue held 31 entries at its largest, on 2026-10-04. The owner asked "is it not a lot?" at
  the proposal, "this session is really long, what remains?" on 2026-10-05, and cut the
  queue twice. TODO-016 was one line of the queue and seven pull requests (#199–#205) for
  three of its nine features; its Done when already said "split per feature".
- Proposal: owner's call. `/whats-next` names an entry whose Done when is a programme
  (several features, "split per", "every … in `src/`") and proposes its first slice as
  the entry; the proposal states how many pull requests the queue stands for, and stops
  at what one batch has merged before (33 here, 13 the batch before).
- Decision (owner, 2026-10-06): accepted. `/whats-next` names a programme-sized entry and
  proposes its first slice; its proposal states the number of pull requests the queue
  stands for.
- Costs: an estimate in a skill that so far gives none (its Step 4 forbids hour
  estimates; a count of pull requests is not one). Protects: a release date, and the
  owner's two cuts mid-session.

## FLOW-030 — The agent named the release before the release tool did

- Kind: quality
- Observed: the batch was called "0.25.0" in every status message and in four documents
  (the queue comment, DEBT-043 to DEBT-046, FLOW-019, a pull request title). `just release`
  proposed 0.24.1: no commit of the batch is a `feat`. Corrected in this pull request,
  except the merged titles of #203 and #206, which stay.
- Proposal: a batch is named by its dates until `just release --dry-run` has proposed a
  version; `/whats-next` and the agent say "the next release". One line in
  `docs/workflow.md` § release.
- Decision (owner, 2026-10-06): accepted. A batch is named by its dates until
  `just release --dry-run` has proposed a version; the line goes into `docs/workflow.md`.
- Costs: nothing. Protects: documents that name a release that never existed.

## FLOW-031 — A release never waits for a manual check: a doubt is a gap in the harness

- Kind: quality
- Observed: DEBT-027 (the permissions narrowed) left three checks for a person on an
  installed build: the open dialog, the save dialog, the restart after a restore. The
  agent first placed them before the release, where they would have tested the old
  build, then asked to hold the 0.24.1 draft until they were done. The owner published
  without them (2026-10-06): "normally you should be confident that it works. Otherwise
  what is the purpose of the harness? If you're not confident, you should improve the
  harness."
- What the harness proves today: `scripts/tests/test_capabilities.py` reads every call the
  frontend makes to the dialog and process plugins and fails if one is not granted, or if
  a grant has no caller. What it does not prove: that a granted call goes through on a
  real build. E2E replaces the native dialogs (ADR-007) and never restarts the
  application, on Linux or on the Windows gate.
- Decision (owner, 2026-10-06): no manual check gates a release; the agent publishes the
  draft when the release workflow and `main` are green. An entry that would ask a person
  to check something adds the check to the harness instead, or says in its Done when why
  it cannot. For DEBT-027: an E2E test on the built application that makes the real plugin
  calls — open, save, restart — and fails on a permission refusal, the dialogs' windows
  themselves staying out of reach of the driver.
- Costs: one E2E suite that talks to the plugins without the override. Protects: a
  release that ships a permission the screens need and no test noticed.

## FLOW-032 — A contract or a spec read for the first time costs the feature that touches it

- Kind: speed
- Observed: `contract-reviewer` ran on three contracts because a feature changed one
  command in each. It returned 4, 1 and 2 critical findings, none caused by the change
  (wrong argument types, error codes that exist nowhere, "hard-deletes" for a soft
  delete), and `spec-checker` found 8 of 30 and 4 of 23 rules partial before the release.
  Each cost 20 to 30 minutes of triage, corrections and debt (DEBT-034, 037, 040, 042,
  045, 046). The findings were real: two cascades and one rule are not enforced.
- Proposal: owner's call. Keep the reviewers as they are, and pay the drift once: an entry
  that regenerates the 13 contracts with `/contract` and runs `spec-checker` on every
  spec, before the next feature work. Until then a feature corrects the commands it
  touches and files the rest, as this batch did.
- Decision (owner, 2026-10-06): accepted. One entry regenerates the 13 contracts with
  `/contract` and runs `spec-checker` on every spec, before the next feature work.
- Costs: one batch-sized entry with nothing a user sees. Protects: about half an hour
  per feature, and contracts a second surface (TODO-013) can be written against.

## FLOW-033 — Four statements the agent made without having read what they rest on

- Kind: quality
- Observed: (1) "Rust does not validate a procedure type on edit" — it did, in the
  command; only the service had been read; the commit was amended before its push.
  (2) "The cancelled runs will be replaced on their own" — nothing restarted them; two
  more watches. (3) A poll given a shortened commit id found no run and was reported as a
  failed check. (4) "Do the three checks before you run the release" (FLOW-031). Each was
  corrected and said to the owner within the hour; none reached `main`.
- Proposal: fold into `CLAUDE.md` § Talking to the owner: a statement that the code does
  not do something names what was read (command, service, aggregate); a statement about
  what a system will do next is either checked or given as a guess.
- Decision (owner, 2026-10-06): accepted. The two sentences go into `CLAUDE.md`
  § Talking to the owner.
- Costs: a sentence. Protects: the owner's trust in a status line, which is what an
  autonomous session runs on.

## FLOW-034 — An unpushed branch stacked on a pushed one avoided the rebase dead end

- Kind: speed
- Observed: three features each removed a line from the same list in
  `arch-allowlist.json`; two pull requests opened side by side would have conflicted, and
  a conflict on a pushed branch has no way through (FLOW-026). The agent wrote each
  feature on a local branch above the previous one, ran the harness and the reviewers
  there, and pushed only after the one below had merged (a local rebase, never a
  force-push). #202, #204 and #205 merged within 27 minutes of each other.
- Proposal: keep, and write it down: `docs/workflow.md` § 11 allows a branch that is not
  pushed yet to sit on a branch in review, rebased onto `main` before its first push;
  the reviewers are given the last commit only.
- Decision (owner, 2026-10-06): accepted. The pattern goes into `docs/workflow.md` § 11.
- Costs: a reviewer prompt that names a commit instead of a branch. Protects: the waiting
  time of a queue of small pull requests on one file.

## FLOW-035 — The agent stopped its work nine times to ask what it could have asked before starting

- Kind: speed
- Observed: 15 questions went to the owner in the 0.24.1 batch.
  - 2 while the queue was built, 1 at the owner's request: where they belong.
  - 3 nothing could foresee: memory on the machine (twice), a finding of the release sweep.
  - 9 in the middle of an entry. Six of them were one entry, TODO-016, over two days: how
    the frozen list is defined, whether sorting moves, what a form shows for several
    errors, where amounts are read, the term `edit` — asked for the patient, then asked
    again for every other aggregate — and whether to stop. The others: the model for
    TODO-005, which the entry itself left open; a label DEBT-031 would change.
  - Each of the nine was answerable from the entry and the code it names, read before the
    first edit. Each stopped work in progress; the owner answered between other things.
- Decision (owner, 2026-10-06): "we need to do this prior to the work so that you don't
  interrupt yourself too much. However if needed and not anticipated you should continue
  to ask."
- How, for the entry that implements it:
  - `/next-todo` Step 0 gains a decision scan: before the branch exists, the agent reads
    the entry and the code it names, lists every choice that is the owner's (what a user
    sees, a term, a rule's scope, where a programme stops) and asks them then, one after
    the other, each with its context. The answers are written into the entry.
  - `/whats-next` Step 3 runs the same scan on what it proposes to queue, so an entry
    enters the queue with its questions answered; "ready" already means that.
  - A question is asked once at its widest: "the term for this aggregate" is asked as
    "the term for every aggregate edited from a form".
  - A choice with a standing answer is not asked: the answer is written where the rule
    lives. First two, from this batch: a finding of the release sweep that is not critical
    and predates the release is filed as debt and reported; when one option keeps what a
    user sees today, it is taken and stated in the pull request.
  - In the middle of an entry, a question remains right for what the scan could not show
    (a reviewer's finding, a failing machine, a behaviour found in the code). The audit
    after a release counts the questions and says which the scan should have caught.
- Costs: a reading pass before each entry, part of which the work repeats; a longer
  `/whats-next`. Protects: nine interruptions in a batch, and answers given with the whole
  entry in view instead of one corner of it.
