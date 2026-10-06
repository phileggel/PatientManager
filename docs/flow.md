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

Each entry has a permanent `FLOW-NNN` id (never reused; next free: FLOW-028). The owner
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

## FLOW-019 — The E2E tooling pulls advisories with no patched release (DEBT-019)

- Kind: quality
- Observed: `npm audit` reports 19 high advisories, all through `basic-ftp`, `braces` and
  `extract-zip` under `@wdio/*` 9.32. None ships in the app: `npm audit --omit=dev`, the
  weekly Security Audit gate, is clean. `braces` and `extract-zip` have no patched
  release; the only fix npm offers is a downgrade to WebdriverIO 5.
- Watch (owner, 2026-10-04): nothing to do until a fixed release exists; each `/dep-audit`
  before a release re-checks it and the agent reports when one does.
- Re-checked 2026-10-06 (`/dep-audit`, 0.25.0): a fixed release exists. WebdriverIO 10.0.0,
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
- Proposal: owner's call. `watch-pr` re-runs once a job that was cancelled without
  running a step, and says so; a job that fails after running is still a failure. The
  description is edited before the push, not after, when the review outcome is known.
- Costs: a watch that writes to GitHub (a re-run), where today it only reads. Protects:
  about 20 minutes and three manual re-runs on such a pull request.
