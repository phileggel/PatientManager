# Flow audits

What each batch measured, written by the agent after a release (`docs/workflow.md` § 12).
The hard points an audit finds are `FLOW-NNN` entries in `flow/`. Newest first.

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
