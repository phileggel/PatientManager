# Flow audits

What each batch measured, written after a release by an auditor that did not run the batch (`docs/workflow.md` § 12).
The hard points an audit finds are `FLOW-NNN` entries in `flow/`. Newest first.

**0.24.4** (2026-10-11, one fix, #267) has no audit of its own: the next audit starts at
`v0.24.3`, so its three pull requests (#265 to #267) are measured with the next batch (owner,
2026-10-11).

---

## Measured — the 0.24.3 batch (2026-10-10 22:15 UTC → 2026-10-11 13:29 UTC; 2026-10-11 local)

Written by `flow-auditor`, as returned (FLOW-043). Figures from `just flow-audit v0.24.2 v0.24.3 --previous v0.24.1` (`truncated`: nothing), each beside the batch before. "Counted" marks what the auditor counted from the pull requests, the runs or `logs/usage.log`. "The session agent says" marks an answer of the session that ran the batch: evidence, not a conclusion.

- **Pull requests merged:** 23 (#235–#263; five of those numbers are issues, #242 is Dependabot's and still open), was 27. Lines added: 3 752, was 3 442. By type: 13 docs, 6 chore, 2 refactor, 1 ci, 1 fix; was 15 docs, 6 fix, 5 chore, 1 refactor. None closed without merging, was none.
  - Counted: 11 pull requests worked the 11 queued references; 12 are records (audit, queue, decisions, filings).
- **Opening to merging:** median 0.7 min, was 1.2; mean 11.3 min, was 12.7.
  - Counted: the 12 record pull requests merged in about 38 s each; the median of the 11 work pull requests is 8.1 min.
  - Counted: #261 alone is 127.8 of about 260 minutes spent open.
- **How long the queue took:** 869.5 min from the first opening to the last merge, was 6 078.5.
  - Counted: two stretches, 22:18–22:39 UTC (7 docs pull requests) and 06:57–12:47 UTC: 6 h 11 min, of which 109 min were the wait on #261.
- **CI rounds:** 28 for 23 branches, was 45 for 27; 5 beyond the first, was 18. Counted causes of the 5:
  - 2 on #252, each a fix after a failed Review (`reviewer-guides`, one critical each).
  - 1 on #261, a fix after a CI finding (`reviewer-arch`, a warning).
  - 2 (one each on #252 and #261) are the folded commit `just merge` pushed. Each was created within 16 s of the merge and tested a tree already tested.
  - From a merge moving `main` under an open pull request: 0, was about 6. No two work pull requests were open together.
- **Run times (median of green runs):** Quality 2.6 min (2.5), Review 1.3 (1.6), E2E 6.5 (6.5), Codec Gate 1.8 (1.8), PR description 0.1 (0.1). Local harness, counted from 18 green runs: median 84 s, longest 117.5 s.
- **Failed runs on pull requests:** Review 2, was 1; nothing else. Cancelled: 0, was 12.
  - Counted: a third Review failure is missing from the figure. Attempt 1 of run 38131788006 on #261 failed at 10:28:04 UTC (`reviewer-arch`); it was re-run at 12:17:23 and now reads as a success. It is the only re-run among the 119 runs of the window.
- **Entries:** 18 filed (13 flow, 3 debt, 2 todo), was 15; 12 closed (10 flow, 2 debt), was 9.
  - Counted: FLOW-042, 043 and 044 are among the 18, but #233 and #234 filed them, and those belong to the batch before. The script counts entries from the tag and pull requests from the publication.
  - The queue: 11 references, all 11 shipped; 9 had been moved to the next batch before work started (#237).
- **Each entry beside its size:** past its size, 1 — DEBT-050 (M, 2 pull requests, 4 CI rounds).
  - FLOW-048 (3 pull requests) and FLOW-042 (2) are counted through branches that only amended them (FLOW-049); one pull request worked each.
  - FLOW-043 (S): 1 pull request, 4 rounds. Four entries had no size when deleted.
- **Open at both ends:** issues 0 → 6 (#248, #257–#260, #264; no entry names any of them); Dependabot pull requests 0 → 1 (#242, put to the next queue in #263).
- **Tools (`logs/usage.log`, from 22:18:05 UTC):** 725 runs, was 1 032. Most run: `rule-homes` 134, `changed-scope` 107, `scoped-checks` 84, `privacy-check` 81, `watch-pr` 36, `arch-check` 35, `check` 29, `core-without-tauri` 27, `work-queue` 27, `harness` 23, `merge` 23.
  - Failures: 25, was 27 — `rule-homes` 11, `harness` 5, `watch-pr` 4, `check` 2, `scoped-checks` 2, `work-queue` 1.
  - Counted: 12 of those 25 fall in 08:27–08:28 and 08:47–08:48 UTC, while #252 met the new guide ceilings; the `work-queue` one is FLOW-050.
  - No outcome, stated by runs alone: `format` 18, `coverage-be` 17, `coverage-fe` 10, `test-scripts` 2.
  - Never run: 13, was 9 — `clean-branches`, `clean-db`, `generate-types`, `migrate`, `prepare-sqlx`, `regen-fixtures`, `release-notes.py`, `review-path.sh`, `review-stop-reason.py`, `run-entry.sh`, `start-app.sh`, `stat`, `visual-proof-capture.mjs`.
  - `release-notes.py` and the two `review-*` scripts run in CI only and are never in this log. For the rest the batch had no migration, no command type change and no `.tsx` change. Keep all.
- **Agents and skills:** CI reviewer reports posted, counted from the comments: 18 on 11 pull requests (infra 9, guides 3, arch 3, backend 3). Local launches and skills run: not counted.
- **Guides:** 39 documents and prompts, 4 746 lines; was 35 and 4 421.
  - Grew: `docs/agentic-setup.md` new at 162, `docs/workflow.md` 434 → 495, `flow-auditor` new at 84, `reviewer-guides` new at 33, `/file-entry` new at 24, `/plan-queue` 97 (its predecessor 90), `/run-entry` 131 (127), `/run-queue` 61 → 66.
  - Shrank: `/flow-audit` 118 → 64, `reviewer-infra` 76 → 75.
  - Documents naming a path that does not exist: 17, unchanged.
- **Defects found before merge, by reviewers (from the bodies):**
  - a skill step named differently from the step it calls (#249);
  - a release printing a changelog section rebuilt after the push, not the one written (#249);
  - the fast checks not running on the new ceilings file, and a rule in the wrong home (#251);
  - a skill copying exit codes and missing two (#253);
  - a spec rule that did not say a rejection for any reason keeps nothing (#261, `spec-reviewer`);
  - three batch writes left without a caller (#261, `spec-checker`, DEBT-056).
- **Criticals only CI found:** 2, both `reviewer-guides` on #252, was 0.
  - Round 1: the auditor's description said it writes what it only returns.
  - Round 2, which the session agent says was: `/flow-audit` Step 3 puts the auditor's "Not in the records" list in `docs/work/audits.md`, while the setup line for that file said it holds the measured section only.
  - One warning only CI found: #261, group lines built outside the aggregate root (DEBT-057).
  - § 11's figure against this: the three pull requests with a CI-only finding added 118, 149 and 1 278 lines.
- **Reviewer claims rejected with a source:** 14 in 9 pull requests (counted).
  - Two cite a rule the reviewer had wrong (#254: the queue is not edited at closure; `docs/work/audits.md` is a record).
  - One was overturned the same day: #246 declined the missing truncation warning for issues with a measurement; the release sweep raised it again and the owner accepted it (FLOW-053).
- **CI findings with no grade in the body or a comment (§ 7):** 5 —
  - warnings: #255 `reviewer-backend` (the log guard misses a field written without a sigil); #252 `reviewer-guides` (line 9 of the setup document, still as it was);
  - suggestions: #247 (one size pattern in three scripts); #256 (two).
- **Defects that reached `main` and were found by use:** 2, both from #247 — `just queue new` fails on any title of several words (FLOW-050); the audit counts a filing branch as work (FLOW-049). The release sweep found 3 infra criticals in the guardrails and 6 contradictions between guides (FLOW-051 to FLOW-054).
- **Rules not followed:**
  1. § 3 step 3, "confirm red": the agent was to see each acceptance test fail first. #261's body says of its rollback tests "not seen failing against the old code". Cost: the guarantee of the batch's one `fix` rests on tests nobody saw fail.
  2. § 11, split above about 800 lines in a lane: #261 added 1 246 hand-written backend lines (counted from its files) in one pull request, "above the guideline, stated". Cost: the one arch finding the local lane missed.
  3. § 12, "nothing of it runs during a batch": `flow-audit.py` ran at 07:58:10 UTC, between #247 and #249. It found FLOW-049.
  4. `CLAUDE.md` rule 4: #251 ran `reviewer-guides` locally "through a general agent following the prompt". The session agent says only #251 did; from #252 the agent type existed and was used. No cost shows in the records.
  5. § 3 step 3 and `CLAUDE.md`: a changed command updates its contract in the same pull request. #261 changed what two validation commands promise and wrote a note on DEBT-049 instead.
- **Guide statements a record shows false, not already filed:** 4 —
  1. `docs/agentic-setup.md`: `scripts/merge.py` "never … force-pushes". Line 206 pushes with `--force-with-lease`, and did on #252 and #261. `CLAUDE.md` rule 1 and § 8 forbid force-pushing without the exception `docs/commit-rules.md` implies ("by hand").
  2. `docs/agentic-setup.md`: `docs/workflow.md` "never says how code is written". Its § 6 is "The right way to code".
  3. `docs/workflow.md`, the usage-log convention: "Skills and agents are counted from the session transcript". § 12 and `flow-auditor` say nothing records them.
  4. `CLAUDE.md` names `reviewer-security` for the release sweep; the workflow's convention says "the reviewer agents"; #262 ran eight lanes.
  - Already filed: FLOW-050 (1), FLOW-051 (1), FLOW-052 (1), FLOW-054 (6 critical, 8 lesser).
- **Generic pieces of `docs/agentic-setup.md` against their line:** 60 lines. 8 are contradicted by a record:
  - `scripts/merge.py` and `docs/workflow.md`, as above;
  - `.claude/settings.json` (FLOW-051);
  - `docs/work/queue.md`, "never edited by the agent": #236 and #237 wrote it on the owner's yes (FLOW-054, issue #259);
  - `CLAUDE.md`, "never states a rule that has a home elsewhere" (FLOW-054);
  - `/dep-audit` (FLOW-054);
  - `scripts/work-queue.py`, which files an entry only when called without its recipe (FLOW-050);
  - the document's own "read the same in every repository" (issue #248: four lines).
  - A ninth rests on an answer, not a record: `reviewer-security`, "across the whole code before a release". The session agent says the security lane of the sweep returned after about 19 s and says in its own report that it read the diff since v0.24.2 or grepped, not every file.
  - `scripts/release.py`, "never run by the agent": 1 run; the session agent says the owner ran `just release -y`.
  - The other 50: no pull request contradicts them; their code was not read line by line, so they are not counted as verified.
- **The owner's answers written into entries:** 26 dated lines in the window's pull requests (counted): 15 while planning (#235–#241), 3 in the decision scan before the first entry (#244), 1 restated in #247, 7 after the release preparation (#263). Asked during the work: none in the records. One the reading before should have caught: the size of DEBT-050.

Reading: the mechanics were the fastest so far — no cancelled run, no round from a moving `main`, 5 rounds beyond the first where the batch before had 18. Nearly half of the minutes spent open (109 of about 260) were one stop on #261, begun by the CI account's usage limit and read by the figures as a success. The batch built its own measuring and guarding tools, and two of them were wrong on first use; the guides grew by 325 lines in the batch that capped them.

**The five questions**

1. A conflict avoided: nothing to change — 0 rounds from a rebase, was about 6.
2. Where it waited: 109 min on #261; 2 rounds on merged commits; 20 min on #255 and 11 on #247 between green and merge, cause not known.
3. Simplify: 12 of 23 pull requests are records, 7 of them from one conversation before #241 made that one pull request; 5 after. Nothing to change.
4. Unused: 13 tools never run, keep all. `run-entry.sh` has not run in two batches (as `next-todo.sh` before): keep, re-check.
5. Guides: 4 false statements not filed, 9 already filed with 8 lesser points; 4 421 → 4 746 lines, the ceilings recorded after the growth. Nothing to change until a batch has run under them.

### Not in the records

Still unanswered:

- **Why #255 waited from 09:29 to 09:47 UTC and #247 from 07:45 to 07:56 UTC** after their checks were green. The session agent says: not known.
- **Why the session's turn ended on the failed watch of #261.** The session agent says: not known.
- **Local agent launches and skills run:** in no record; not counted.
- **Whether the acceptance test of #256 was seen red:** it added none.

Answered by the session agent, and in no record — each should have been written where named:

- **When and on what the release sweep ran, and what each lane read** — it says: on the local checkout of `main` at 3e95603, after #261 merged, the lanes returning in 6 s to 192 s; the five entry files were created before the migrations lane had returned and committed after it; three lanes read the diff or grepped. Belongs in #262's body (FLOW-061).
- **Who ran the release** — it says: the owner ran `just release -y` at a terminal, as a shell command typed into the session; the session did not. The usage log has no runner, so the setup line for `scripts/release.py` cannot be checked from the records.
- **The second critical on #252** — it says: the setup line for `docs/work/audits.md` against `/flow-audit` Step 3. Belongs in the CI report, which was overwritten (FLOW-058).
- **The wait on #261** — it says: nothing was done from about 10:30 to 12:17 UTC; the reset time (11:50 UTC) was read in the reviewer's comment and checked with `date -u` before the re-run. Belongs in #261's comment, which gives the cause but not the times.
- **How `reviewer-guides` ran locally after #251** — it says: as the agent type `reviewer-guides` on #252, #253 and #254.

One more, about this audit: the `CLAUDE.md` injected into the auditor's context is the text before #245 and #246 (it names `/next-todo` and `just whats-next`). It read the file on `main` instead. A session started before those merges works from the old index.

Owed by § 2, not proposals of this audit: six open issues have no entry — #248, #257, #258 and #259 (generic lines of the setup document), #260 (a sixth audit question: the missing tool, the finding owed to another repository), #264 (todo entries are shared, not human-owned). Each becomes an entry at the next `/plan-queue`.

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
