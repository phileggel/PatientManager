# Flow audits

What each batch measured, written by the agent after a release (`docs/workflow.md` § 12).
The hard points an audit finds are `FLOW-NNN` entries in `flow/`. Newest first.

---

## Measured — the 0.24.2 batch (2026-10-06 → 2026-10-10)

Figures from `just flow-audit v0.24.1 v0.24.2 --previous v0.24.0`, each beside the batch
before. The last audit written by the agent that ran the batch (FLOW-043).

- **Pull requests merged:** 27 (#208–#234 opened, #233 and #234 after the tag), was 35;
  3 442 lines added, was 5 048. By type: 15 docs, 6 fix, 5 chore, 1 refactor. None closed
  without merging, was 1.
- **Opening to merging:** median 1.2 min, was 8.3; mean 12.7 min, was 87.6. The median is
  the docs pull requests, opened once their checks were known to pass.
- **The working day of 2026-10-10:** 23 pull requests, first opened 13:17 UTC, last merged
  22:11 UTC: 8 h 54 min, one session.
- **CI rounds:** 45 for 27 branches, was 65 for 36; 18 beyond the first, was 29. Of the
  18: 5 on #220 (FLOW-040), about 6 from a merge moving `main` under an open pull request
  (FLOW-039), the rest a fix after a review or a failed check.
- **Run times (median of green runs):** Quality 2.5 min (2.6), Review 1.6 (2.3), E2E 6.5
  (7.0), Codec Gate 1.8 (1.7). The local harness: about 2 min on the new machine, was 12.
- **Failed runs on pull requests:** Review 1, was 12; nothing else, was 4. Cancelled: 12,
  was 32 — 8 of them "PR description", restarted by an edit of the description.
- **Entries:** 15 filed (DEBT-047 to DEBT-055, FLOW-036 to FLOW-041), 9 closed (DEBT-036,
  038, 044; FLOW-029, 030, 033, 034, 035, 037). The queue: 16 references validated, 1
  added, 8 cut to the next batch on the owner's decision; 9 shipped.
- **Tools (`logs/usage.log`, from 2026-10-10 13:04, the day the project moved machines):**
  1 032 runs; `rule-homes` 145, `changed-scope` 137, `privacy-check` 126, `scoped-checks`
  111, `check` 59, `arch-check` 57, `whats-next` 48, `watch-pr` 41, `merge` 34, `harness` 26. Real failures: 27. Never run: `clean-branches`, `next-todo.sh`, `prepare-sqlx`,
  `regen-fixtures`, `release-notes.py`, `review-path.sh`, `review-stop-reason.py`,
  `start-app.sh`, `stat` — the three `review-*` and `release-notes` run in CI only; the
  others had no occasion. Keep all. The script counted the 106 `started` lines of the
  recipes as failures (FLOW-047).
- **Agent launches (counted from the session):** 39, all prescribed: infra 7, backend 7,
  arch 7, security 4, frontend 4, spec-reviewer 4, contract-reviewer 3, spec-checker 1,
  e2e 1, sql 1. Skills run: `/whats-next` 1, `/next-todo` 1, `/contract` 1,
  `/visual-proof` 1, `/dep-audit` 1. Not run: `/design-proposal`, `/spec-writer`,
  `/adr-writer`; `/run-queue` and `/flow-audit` were written this batch and followed by
  hand. Native commands where a recipe exists: `cargo check` once, `cargo test` twice.
- **Guides:** 35 documents and prompts, 4 421 lines, was 4 155: `docs/workflow.md` 366 →
  434, two new skills (179 lines), `/whats-next` 77 → 90. 17 documents name a path that
  does not exist, unchanged; some are folders created at run time.
- **Defects found before merge:** by local reviewers — an entry on an unmerged branch read
  as shipped; a subcommand typo answered with the report; a command the contract listed
  that does not exist; a reconcile command left unguarded; one rule written in two places
  and one error code duplicated; a spec rule that contradicted another. By CI — a skill
  still telling the agent to use a step the same pull request removed; a wrapper no test
  reached (patch coverage). By the release sweep — the parser could not read a negative
  total, so the hotfix already merged (#224) did not fix the statement it was written for
  (#231 did).
- **Wrong statement by the agent:** 1 that mattered — the cause of the blocked statement,
  given as read when it was inferred from a log (FLOW-046). **A rule not followed:** no
  `spec-checker` before closing #224, which carried spec rules.
- **Questions to the owner:** not counted.

Reading: the mechanics were fast — a median of a minute from opening to merging, one
failed run where the batch before had sixteen — and the layout changes removed the
conflicts between closures. The time went to CI rounds that tested nothing new (FLOW-039,
FLOW-040) and to a production fault diagnosed from a log instead of from its input, which
cost a hotfix that did not fix it (FLOW-046). The guides grew by 266 lines in one day
with nothing to hold them (FLOW-044).

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
