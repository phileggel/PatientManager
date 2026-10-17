# Flow audits

What each batch measured, written after a release by an auditor that did not run the batch (`docs/workflow.md` § 12).
The hard points an audit finds are `FLOW-NNN` entries in `flow/`. Newest first.

---

## Measured — the v0.24.8 batch (2026-10-17 11:11 UTC → 2026-10-17 21:45 UTC)

Written by `flow-auditor` and revised once with the session agent's answers. The figures come from `logs/flow-audit.json` (`just flow-audit v0.24.7 v0.24.8 --previous v0.24.5`; `truncated`: nothing). "Counted" means the auditor counted it from the pull requests, the runs (`gh run list`, `gh run view`), the comments' edit history (GraphQL `userContentEdits`), the commits (`gh api …/commits`) or `logs/usage.log`. "The session agent says" marks an answer: evidence, not a conclusion. The invoking prompt gave the three tags and the figures file and nothing else.

- **Pull requests merged:** 17 (#301–#318 without #309), was 19. Lines added: 1 216, was 2 633.
  - By type: 11 docs, 3 refactor, 1 fix, 1 ci, 1 chore; was 7 docs, 5 chore, 5 fix, 2 refactor.
  - Closed without merging: 1 (#309), was 1.
  - Counted: 10 are work (#306–#308, #310–#314, #316, #317) and 7 are records (#301–#305, #315, #318). Was 13 and 6.
- **Opening to merging:** median 7.7 min, was 8.5. Mean 27.3 min, was 13.1.
  - Counted: 463 min open in total. #313 alone was open 220.8 min (48 %); then #316 72.8, #307 38.7, #310 36.2, #314 35.5. #309 was open 77.5 min before it was closed.
- **How long the queue took:** 585.4 min from the first opening to the last merge, was 6 005.1.
  - Counted, gaps of 20 min or more in the usage log: 11:47 → 13:30 (103 min; the session agent says planning, the owner's answers to the queue and to five decisions); 15:31 → 16:16 (45 min; the session agent says a local `reviewer-infra` re-read that ran 3 844 s in the background); 16:19 → 16:45; 17:22 → 17:52 (a 30-min watch timeout; the session agent says it waited on the Release dry run's `build / windows`); 21:13 → 21:45 (the release workflow).
  - Counted: v0.24.8 was tagged at 21:13:14; the release workflow ran 21:13:17 → 21:45:15; the release was published at 21:45:35. The session agent says the owner typed `just release -y` after "ready" was said in chat once #318 had merged.
- **CI rounds:** 50 for 18 branches, was 33 for 20. Beyond the first: 32, was 13. Counted causes:
  - 15 were fixes after a CI review finding: #313 8, #316 3, #309 2, #310 1, #312 1.
  - 8 were the folded commit `just merge` pushes, all on a pull request already merged or merging (#306, #308, #310–#314, #316). Was 8. #313's own fold was cancelled by its own change.
  - 5 came from a rebase alone, after `main` moved (#307 a2a0929 and 9dc9001; #313 c2a6079 and 65bcebe; #316 e841eda). Was 2. 4 of those rebased a branch whose last round was green and graded; 10 more rounds followed them: #313 7 (rounds 6–12), #316 3 (rounds 3–5).
  - 3 were a rebased fold that `just merge` pushed while the checks were red, before its green guard (#309 27fdf69 and 8f4afc1; #312 4b7163d). The session agent says the commands were chained as `just watch-pr N …; just merge`.
  - 1 was a fix after the local review or `spec-checker` (#307 1ba263a).
- **Run times (median of green runs):** Quality 2.8 min (2.4), Review 2.5 (1.4), E2E 6.8 (6.8), Codec Gate 1.8 (2.0), PR description 0.1 (0.1), Release dry run 15.3 (33.0). The dry run ran on every #313 round.
- **Failed runs on pull requests:** Review 14, was 2: #313 7 plus 1 failed attempt, #309 4, #310 1, #312 1. Re-runs: 1 (#313), was 0.
  - Cancelled: 20, was 2. Counted: 10 superseded by a newer push within 4 min; 6 were #313's own runs, cancelled at its merge; 4 PR description runs restarted by a description edit after the push.
  - Counted, outside the figure: 7 push runs on `main` were cancelled, was 1. 3 were superseded by the next merge. The other 4 came after #313: d25e342's Quality, Codec Gate and E2E (runs 39069286584, 39069286597, 39069286591) and a3937ae's Quality (39069570258), each cancelled 2–3 s after it started. 240bbf1, pushed with no pull request, ran green.
- **Entries:** 10 filed (7 flow, 2 debt, 1 todo), was 14. 17 closed (12 flow, 5 debt), was 10.
  - Counted, the queue: 19 references at #304, 18 after the owner cut TODO-018 (#315). 16 closed; 2 are slices left open by design: FLOW-054 (slice 2) and DEBT-065 (its two 🟡). FLOW-084 was filed (#310) and closed (#313) within the batch.
- **Each entry beside its size:** past its size 0, was 0. FLOW-056 (S) took 1 pull request and 12 rounds, the most; DEBT-048 (M) took 6.
- **Open at both ends:** issues 6 → 0 (closed by #308, #310, #311). Dependabot pull requests 0 → 0.
- **Tools (`logs/usage.log`, from 2026-10-17 11:27:26 UTC):** 958 runs, was 898.
  - Most run: `rule-homes` 176, `privacy-check` 159, `changed-scope` 154, `scoped-checks` 142, `arch-check` 47, `check` 41, `watch-pr` 39, `work-queue` 28, `branch` 26, `merge` 26.
  - Failures: 42, was 38 — `watch-pr` 14 (12 exit 1, red rounds; 2 exit 3, 30-min timeouts: 16:50 on #310, cause not known, and 17:52 on #313, the dry run's Windows build by the session agent), `merge` 10 (5 within 5 s of a failing watch through the `;` chain, 3 of which pushed a round; 2 #307 meeting a moved `main`; 3 stop after a rebase that moved the commits), `rule-homes` 7, `scoped-checks` 6, `arch-check` 2, `check` 2, `harness` 1 (not attributed).
  - `release.py`: 1 run, ok, the owner's (the session agent). `visual-proof-capture.mjs`: 2 runs, ok.
  - Never run: 15, was 12 — `batch-end` (not needed, the batch released), `clean-branches`, `clean-db`, `flow-audit.py` (ran after the window), `generate-types`, `migrate`, `prepare-sqlx`, `regen-fixtures`, `release-notes.py`, `review-path.sh`, `review-stop-reason.py` (CI only), `run-entry.sh`, `start-app.sh`, `stat`, `test-scripts` (its command runs in CI and `just harness`).
- **Agents and skills:** CI reviewer comments, 45 on 11 pull requests (guides 18, infra 18, arch 4, backend 2, frontend 2, security 1); #313 alone has 23. On #316 the last state of 3 lanes is "review skipped", from the fold's run after the merge, replacing round 5's reports (kept in the edit history). The one local launch known is a `reviewer-infra` re-read of 3 844 s (the session agent); the rest not counted.
- **Guides:** 39 documents, 4 738 lines, was 4 747 (−9). Words 40 144, was 39 763 (+381). `docs/workflow.md` 495 lines at both tags, +81 words; `docs/agentic-setup.md` +65, `review-protocol.md` +55, `/run-entry` +14, `flow-auditor` +10, `CLAUDE.md` −1. Documents naming a path that does not exist: 17, was 17.
- **Defects found before merge, by reviewers:** #306 `/spec-writer` batching questions; #307 a thrown call leaving Save loading (`spec-checker`, PRO-190), footer ids; #308 the kinds' edges, the bug rule, the agent's writes; #309/#310 queue ownership, the tag step and push, `release.py` counting from a batch tag, and (CI) the sweep's scope, the sibling clause, the auditor's header, two "release" words, `reviewer-security`'s description, `/dep-audit`'s third case; #311 the `run-entry` setup line, the task-list home, the filing order; #312 "Release blocker" and (CI) line 244's commit message; #313 § 7 against the skill, `release-dry-run.yml`, protocol line 40, the grading step's home, rule 6's source, the `closed` guard; #314 a domain refusal as `DatabaseError`; #316 B21, the extraction kind, a re-export, a log.
- **Criticals only CI found:** 14 graded (a), was 2 — #309 7 (round 2 repeated round 1 on a fold with no fix), #310 1, #312 1, #313 5. 11 more graded (c): 10 were the base checkout (`claude-code-action` restores `.claude` and `CLAUDE.md` from `origin/main`), 1 rejected with a quoted run log.
- **Reviewer claims rejected:** 8 (c) lines cite a source. 9 (c) lines in 6 pull requests cite none (#308, #310, #312, #313 ×4, #314, #316); 2 came back from the sweep (#308's touchpoints as FLOW-085, #314's mapping as DEBT-069).
- **CI findings with no grade:** 1 🔴 and 6 🟡, was 4 🔵 — #310 round 1 (🔴 `run-queue` setup line, 2 🟡), #308 (2 🟡), #311 (2 🟡, merged 28 s after the comment).
- **(b) grades with no entry:** 0, was 17.
- **Defects that reached `main` and were found later:** FLOW-085 (🔴 `/plan-queue` Step 4 against § 3, #310; `/run-entry` restating the question rule, #306; `batch-end` logic in the `justfile`, #310; `adr-reviewer.md` "before a release", #310; § 1's touchpoints, #308); DEBT-069 (#314's mapping, #316's message); TODO-024 (#307's Save state). Found by this audit only: since #313 a merge cancels `main`'s push runs.
- **Rules not followed:**
  1. § 8, three red rounds of one gate or three hours → stop and ask. #313's Review failed on 7 commits plus 1 attempt, open 3 h 41 min; the session agent says the count was not applied. FLOW-074's Review failed 5 times across #309 and #310. Cost: 11 extra rounds on #313, 12 Release dry runs, 23 lane sessions.
  2. § 7, every finding graded: the 1 🔴 and 6 🟡 above, in part through the `; just merge` chain.
  3. § 7, a (c) cites what overrides the finding: 9 lines, 2 came back.
  4. § 7, a CI finding the local run missed → a rule in that reviewer's prompt: #312 changed no prompt. Third audit in a row with an instance.
  5. `CLAUDE.md` § Agents, re-run on the fixes before the push: #313 round 6 was pushed unread, and the next round raised a 🔴.
  6. `spec-checker` on every spec the batch touched before its end: not run at the end on the spec holding REF-100, whose code #314 changed (the session agent); #307 ran it on PRO-190.
- **Guide statements a record shows false, not already filed:** the six workflows' `closed` comment ("cancels the rounds still running on a pull request") — it reaches `main`'s group too (a guess, not checked: a merged pull request's `closed` event carries the base branch as `github.ref`); TODO-018's Done when keeps "behaviour is unchanged" beside the owner's answer; #313's round-5 grade "the rule 6 fix held" against round 4's "applies after this merges"; `CLAUDE.md` "the closing brief is the PR body's first lines": 11 of 18.
- **Generic pieces of `docs/agentic-setup.md` against their line:** 60. Contradicted: `justfile` (#310's `batch-end`), `docs/work/queue.md` (#315 edited it), `flow-auditor` "nor writes a file" (this audit wrote copies to the session's scratch directory), `CLAUDE.md` "read every turn" (not reloaded during the session, by the session agent; this auditor received v0.24.7's text).
- **The owner's answers written into entries:** 9 dated (FLOW-079; DEBT-057, FLOW-074; FLOW-032, DEBT-037, DEBT-047, DEBT-064; DEBT-062's design; TODO-018), 14 banked Decision lines (#304), 3 confirmed glossary rows, 3 answers in #310. Through `AskUserQuestion` (the session agent): who runs `batch-end`, emptying the queue, TODO-018's refusals and placement, DEBT-062's design, #304's questions; the CVE-at-batch-end rule was volunteered by the owner. No times recorded. One the reading before the work should have asked: who tags a batch (asked during #309).

Reading: the batch merged 17 pull requests with 32 extra rounds (was 13), 14 criticals only CI found (was 2) and 20 cancelled runs (was 2); the mean time open doubled to 27.3 min while the median fell to 7.7. Half of the open time and 11 of the extra rounds are one S entry (FLOW-056, #313): its rounds kept finding something new, including after green graded rounds a rebase re-opened, and § 8's count was not applied. The batch released 20 s after its workflow went green with no (b) left unfiled, but a change it merged (#313) cancels `main`'s push runs, and neither its 23 reviews nor the sweep saw it.

**The six questions**

1. A conflict avoided: #309's `--fixup HEAD~N` named commits on `main`, caught at merge and reopened as #310 (FLOW-088); a rebase re-opened a green review 4 times (FLOW-089); #307/#308 merging 14 s apart: keep (FLOW-039).
2. Where it waited: #313's 221 min with § 8 not applied (FLOW-090); the `; just merge` chain (FLOW-087); a 64-min background local re-read (FLOW-090); the dry run's 30 min: keep; the release workflow's 32 min: keep.
3. Simplify: 7 of 17 pull requests are records, was 6 of 19. Nothing to change.
4. Unused: 15 never run; keep all.
5. Guides: −9 lines, +381 words (FLOW-073); four false statements; six sweep findings in text the batch wrote (FLOW-085); a session that does not reload `CLAUDE.md` works on the pre-batch text (FLOW-092).
6. By hand: a fixup's target (FLOW-088), watching `main` after a merge (FLOW-086), the § 8 count (FLOW-090), reading the comments before merging (FLOW-087). Owed to another repository: #311 rewrote the generic part of `docs/agentic-setup.md` from issues filed while porting it; whether that repository gets the same text is unrecorded.

**Flow entries.** Settled, to close: FLOW-032, FLOW-039, FLOW-070. Re-checks written on the entries. Proposed: FLOW-086 to FLOW-092, filed in the audit's pull request. FLOW-086 (it cancels `main`'s runs) and FLOW-090 with FLOW-072 are the first to queue.

## Not in the records

Answered by the session agent and in no record. Each should have been written where named:

- The owner typed `just release -y`; "ready" was said in chat after #318. Belongs in a comment on #318.
- The questions went through `AskUserQuestion`; the CVE rule was volunteered. No times. The answers belong on their entries, with their times.
- TODO-018's refusals were raised by the run's scan before any branch. Belongs on TODO-018.
- § 8 was not applied on #313. Belongs in a comment on #313.
- #313's timeout waited on the dry run's Windows build.
- 11:47 → 13:30 was planning; 15:31 → 16:16 a 3 844-s background re-read. The re-read belongs in #309's comments.
- `spec-checker` was not run at the end on the spec holding REF-100. Belongs in #318.
- `watch-pr` and `merge` were chained with `;`.
- `CLAUDE.md` was not reloaded during the session.

Still unanswered: whether #301 and #303 record one discussion (both predate the session); the cause of #310's watch timeout. Local agent launches and skills run, beyond the one re-read, are not counted.

---

## Measured — the 0.24.7 batch, with 0.24.6 folded in (2026-10-13 04:26 UTC → 2026-10-17 11:11 UTC)

Written by `flow-auditor` and revised once with the session agent's answers. The figures come from `logs/flow-audit.json` (`just flow-audit v0.24.5 v0.24.7 --previous v0.24.3`; `truncated`: nothing). "Counted" means the auditor counted it from the pull requests, the runs (`gh run list`, `gh run view`), the comments' edit history (GraphQL `userContentEdits`) or `logs/usage.log`. "The session agent says" marks an answer: evidence, not a conclusion. The invoking prompt gave the three tags and the figures file and nothing else.

- **Pull requests merged:** 19 (#281–#300 without #289), was 17. Lines added: 2 633, was 1 407.
  - By type: 7 docs, 5 chore, 5 fix, 2 refactor; was 8 docs, 5 chore, 2 fix, 1 ci, 1 other.
  - Closed without merging: 1 (#289), was 0.
  - Counted: 13 are work (#284–#288, #290–#294, #296, #299, #300) and 6 are records (#281, #282, #283, #295, #297, #298). Was 9 and 7.
- **Opening to merging:** median 8.5 min, was 7.6. Mean 13.1 min, was 143.5.
  - Counted: the 19 pull requests were open 248 min in total. #292 alone was open 84.7 min. Its `merge.py` exited 1 twice by 18:30:29 UTC, and no tool ran until 19:43:52.
    - The session agent says `main` had moved (#291 merged). It ran merge and watch again later. It recalls only waiting on the owner's answer to TODO-019's naming question.
  - Counted: #299 was open 33.5 min, waiting for the Release dry run (33.0 min). #299 itself added that trigger.
- **How long the queue took:** 6 005.1 min from the first opening to the last merge, was 2 468.0.
  - Counted from the usage log, three stretches with no pull request open: 2026-10-13 04:45 → 10-14 04:36, 10-14 05:24 → 17:32, and 10-14 20:00 → 10-17 06:29 (58.5 h).
    - The session agent says the question on TODO-019's `edit` was asked at about 18:00 UTC on 10-14 and repeated in several status messages. It was answered on 10-17 ("go with (a)"), and it held TODO-019 back for that whole stretch.
  - Counted: v0.24.7's release workflow was green at 09:27:15 UTC and the release was published at 11:11:19, 1 h 44 min later. No tool ran in between.
    - The session agent says the session hit the claude.ai usage limit and published when the limit reset.
- **CI rounds:** 33 for 20 branches, was 38 for 17. Beyond the first: 13, was 21. Counted causes:
  - 8 were the folded commit that `just merge` pushes (#282, #284, #286, #288, #290, #291, #293, #294). 7 of them ran after the merge; only #291's was tested first.
  - 2 were fixes after a critical that only CI found (#284, b684077 and 730a395).
  - 2 came from a rebase alone (#292 74c7d49, #300 06d4c93), was 0. #291's fold also carried a rebase.
  - 1 was an owner's answer added 48 s after the first push (#282 1ea9ee8, DEBT-057's Waits line).
- **Run times (median of green runs):** Quality 2.4 min (2.7), Review 1.4 (1.9), E2E 6.8 (6.6), Codec Gate 2.0 (1.7), PR description 0.1 (0.1), Release dry run 33.0 (31.1; it ran on #299 only).
- **Failed runs on pull requests:** Review 2, was 8, both on #284. Re-runs: 0, was 1.
  - Cancelled: 2, was 25. Both are PR description runs on a commit that has two such runs (#282 1ea9ee8, #284 b684077), so the description was edited after the push.
  - Counted: 1 push run on `main` was cancelled (ae616a8 Quality), was 3.
  - Counted, outside the figure: the Release workflow of the v0.24.6 tag failed in its Windows E2E job (run 39013736595). v0.24.6 has no release.
- **Entries:** 14 filed (7 debt, 7 flow), was 20. 10 closed (6 debt, 3 flow, 1 todo), was 15.
  - Counted, the queue: 11 references. 8 are closed. 3 are slices whose entries stay open by design: DEBT-045, DEBT-046, DEBT-057. DEBT-043 was cut by the owner on 2026-10-17 (#295); it was refined as M on 10-14 and read as L at the work.
  - Counted, outside the queue:
    - DEBT-068 (#299): the owner's choice, written on the entry.
    - DEBT-063 (#300): the session agent says the owner asked for "something visible to the user so that the release will be updated" ("just a small ticket will do the trick"), and the agent chose DEBT-063. With #299 alone, `just release` would have refused for lack of a releasable commit.
    - rustls (#296): fixed during the release preparation, with no entry.
  - Counted: TODO-019, 8th in the queue, was worked after DEBT-011 and FLOW-020 (10th and 11th), three days later. The session agent says it was waiting on the `edit` answer. No record says so.
- **Each entry beside its size:** past its size 0, was 0. FLOW-069 (S): 1 pull request, 4 rounds, the most. DEBT-057, bundled into #294, is not listed.
- **Open at both ends:** issues 6 → 6. Dependabot pull requests 0 → 0.
- **Tools (`logs/usage.log`, from 2026-10-13 04:44:35 UTC):** 898 runs, was 667.
  - Most run: `rule-homes` 128, `changed-scope` 122, `privacy-check` 114, `scoped-checks` 102, `check` 82, `arch-check` 81, `core-without-tauri` 40, `branch` 34, `format` 30, `work-queue` 28, `merge` 27, `watch-pr` 26, `harness` 20.
  - Failures: 38, was 38 — `check` 9, `merge` 8, `harness` 5, `scoped-checks` 5, `arch-check` 4, `rule-homes` 4, `watch-pr` 2, `work-queue` 1.
    - Counted: the 2 `watch-pr` exits are #284's two red Review rounds — answers, not faults of the tool.
    - Counted: of the 8 `merge` exits, 3 at 18:11 UTC are #289's dead end (FLOW-076); the other 5 stop at a rebase (#291 2, #292 2, #300 1).
  - No outcome, stated by runs alone: `format` 30, `coverage-be` 8, `coverage-fe` 8, `prepare-sqlx` 5, `test-scripts` 2, `generate-types` 1.
  - `release.py`: 2 runs, both ok, ending 07:28:04 UTC (v0.24.6) and 08:56:59 (v0.24.7). The session agent says the owner typed `just release -y` both times.
  - `visual-proof-capture.mjs`: 2 runs, ok. The session agent says no platform override was set.
  - Never run: 12, was 14 — `clean-branches`, `clean-db`, `flow-audit.py`, `migrate`, `regen-fixtures`, `release-notes.py`, `rerun-failed`, `review-path.sh`, `review-stop-reason.py`, `run-entry.sh`, `start-app.sh`, `stat`. `release-notes.py` and the two `review-*` scripts run in CI only; `flow-audit.py` ran at 11:12, after the window.
- **Agents and skills:** CI reviewer comments, counted in their last state: 27 on 13 pull requests, #289 included (arch 9, backend 6, infra 5, frontend 4, guides 1, security 1, e2e 1).
  - 2 of those last states are a "review skipped" from a round that ran after the merge, each replacing a full report: #293 `reviewer-e2e` (7 files reviewed in round 1) and #294 `reviewer-arch` (8 files).
  - Earlier rounds can be read in the comments' edit history; this audit read #284, #293 and #294 that way. Local launches and skills run: not counted.
- **Guides:** 39 documents, 4 747 lines, was 4 746. Words: 39 763, was 39 692 (+71).
  - `docs/workflow.md` 494 → 495 lines (its ceiling), +47 words; `/plan-queue` +17 words, `docs/agentic-setup.md` +6, `/file-entry` +2, `CLAUDE.md` −1. All from #284.
  - Documents naming a path that does not exist: 17, unchanged.
- **Defects found before merge, by reviewers (from the bodies):**
  - #284: the `Refined` line had no home in § 2 (CI); the setup line drifted from its skill; a cut dropped `Open questions: none`; the scan was qualified outside § 3; a dangling pointer.
  - #285: a stray build file.
  - #288: an Excel-error SSN and a blank Secu cell had no test (`spec-checker`).
  - #289/#291: after a failed read, Continue would save over the stored mappings; the button had no stable id.
  - #290: DEBT-057's Where line named a removed method.
  - #293: a copy of the helper was left in `seed.ts`.
  - #294: the overpayment site still built a group's line (DEBT-057 stays open).
- **Criticals only CI found:** 2, was 8. Both are `reviewer-guides` on #284, which added 35 lines.
  - Round 1: the `Refined` line had no home. The local lane had raised it as 🟡, and the author graded it (b).
  - Round 2: the skill's `Refined` content disagreed with § 2 (size). The body does not name it as a CI finding.
  - The body says "Each pass raised a new 🔴 on text earlier ones passed".
- **Reviewer claims rejected with a source:** 7 (c) in 5 pull requests (counted). 2 cite no rule, file, measurement or decision: #288 "test names (c)"; #294 "a not-found group keeps its no-op status write, as before (c)" — "pre-existing" alone, which § 7 refuses.
- **CI findings with no grade in the body or a comment:** 4, was 5 — #286 `reviewer-backend` 3 🔵 on test names; #284 `reviewer-guides` round 1, 1 🔵.
- **(b) grades with no entry (§ 7: "(b) → DEBT-NNN entry, linked"):** 17 in 7 pull requests (counted) — #284 6, #286 3, #291 3, #299 2, #285 1, #287 1, #293 1. #288 wrote its (b) on DEBT-046, as the rule asks.
- **Defects that reached `main` and were found later:**
  - DEBT-068: #285 (WebdriverIO 10) broke the Windows E2E gate; the release of the v0.24.6 tag found it.
  - FLOW-077 (the sweep): 3 guides 🟡 in #284's text. Also the Node ≥ 22.19 floor, which #285 graded (b) with no entry.
  - DEBT-066 (the sweep): 3 `trace!` without `target` in code the batch touched. Also the per-row `<select>` id, which #291 graded (b) with no entry, and the `bank_manual_match` no-op, which #294 graded (c) "as before".
  - Counted: the v0.24.7 release notes hold one line. The four fixes of 0.24.6 are in `CHANGELOG.md` but on no published release page.
- **Rules not followed:**
  1. **`CLAUDE.md` Core rule 3, "The task's Done when is the plan", with § 3 step 10 (closure).** FLOW-019's Done when asked for the E2E suites to pass "on Linux and on the Windows gate"; #285 closed the entry with "On the Windows gate: it runs at release, so it is proven there, not here". Cost: a tag that could not release (v0.24.6), two more pull requests (#298, #299), 1 h 29 min from tag to tag, and release notes missing four fixes. Counter-argument: no pull-request check ran the Windows gate on a `package.json` change. It survives: the entry could have stayed open, or the trigger could have been added then, as #299 did.
  2. **§ 7, (b) → an entry, linked.** 17 grades have no entry, and 2 came back as sweep findings. This is FLOW-065's banked proposal, still not worked.
  3. **§ 7, "A CI finding the local run missed → a rule in that reviewer's prompt, same PR".** #284 says "no prompt change", and `reviewer-guides.md` is 33 lines at both tags. Counter-argument: round 1's finding had been raised locally, at a lower severity. It survives for round 2. The second audit in a row with this rule unmet.
  4. **§ 7, "(c) is never 'pre-existing' alone".** #294's "as before". The same no-op is now DEBT-066's 🔵.
  5. **`CLAUDE.md` Vocabulary ("confirmed terms in code"), the glossary's setup line ("never extended by the agent without a question"), and `/run-entry` "Never: a guess where a question is owed".** #286 put `ProcedureType::ensure_mutable` in code at 2 call sites, wrote its glossary row as `proposed`, and wrote "owner to confirm" in the body. The session agent says the question sat at the end of a status message; the owner asked "what are you waiting for?", and the agent read that as a go-ahead. Cost: no entry carries the question, and the row is still `proposed` at v0.24.7.
  6. **§ 7, `spec-checker` before closing an entry that carries spec rules.** #300 closed DEBT-063 (PRO-310), and its body names no `spec-checker`. Counter-argument: `spec-checker` had read that spec 1.5 h earlier. It survives in part: the code changed after that read.
  7. **§ Release sweep, "What they find is filed as DEBT-NNN, not fixed in the release"; `/dep-audit` "Never: upgrades by itself".** #296 fixed the rustls advisories during the release preparation. The session agent says it was not the owner's decision: the agent read the skill's "🔴 CVEs must fix before release" and fixed it without asking. Cause: the skill contradicts the workflow (FLOW-054, contradiction 1, decided 2026-10-11, not yet fixed), and here that contradiction became an unasked upgrade.
  8. **§ 3 Release, "only then does it tell the human the release is ready".** #299 and #300 merged after the sweep, which read 598f354 and 4edd114. The session agent says no sweep followed and the owner was told "ready" directly. FLOW-074's case a second time, with a fix chosen for the release tool's sake.
  9. **`CLAUDE.md` § Who decides what, "a question is asked alone, with the context".** The session agent says three questions went inside status messages: `ensure_mutable` (2026-10-14), TODO-019's `edit` (10-14 → 10-17), and the zip advisories (10-17, about an hour). Cost: TODO-019 waited about 60 h, and a term merged without validation. FLOW-078 was decided on 2026-10-17.
- **Guide statements a record shows false, not already filed:** 1. `CLAUDE.md` § Opening and closing says the closing brief is "the PR body's first lines"; all 18 merged bodies that carry a brief open with the opening brief and end with the closing.
  - Live again, already filed: `/dep-audit`'s "🔴 CVEs must fix before release" against § Release sweep, acted on in #296 (FLOW-054, contradiction 1).
  - Already filed: the queue's setup line (#282 and #295 wrote the queue; FLOW-054), `merge.py` force-pushing (8 folds; FLOW-056, FLOW-076), and FLOW-077's 3.
- **Generic pieces of `docs/agentic-setup.md` against their line:** 60 lines. Contradicted by a record: `docs/work/queue.md` (#282, #295); `scripts/merge.py` (8 force-with-lease folds); `/dep-audit` (#296, on the answer); `docs/ubiquitous-language.md` (#286); `/run-entry` (a guess where a question was owed, on the answer). `scripts/release.py` "never run by the agent": not contradicted, on the answer. `flow-auditor` "nor writes a file": this audit wrote copies of pull request views and a run list into the session's scratch directory, outside the repository; nothing in the repository was written. The other 54: no pull request contradicts them; not checked line by line.
- **The owner's answers written into entries:** 5 dated lines (counted) — DEBT-057, 2026-10-14 (#282); DEBT-043, the cut of 2026-10-17 (#295); FLOW-078 and DEBT-067, Decisions of 2026-10-17 (#297); DEBT-068, "the owner chose a fix and v0.24.7" (#298).
  - Elsewhere: the queue file (validated 2026-10-14, cut 2026-10-17); the glossary (`edit`, 2026-10-17, #294); #286's undated "approved by the owner" for the contracts.
  - Asked during the work: 7 — DEBT-043's size, TODO-019's `edit`, `ensure_mutable`, #286's contracts, the zip advisories, the v0.24.7 path, and DEBT-057's refund factory (still open).
  - Three that the reading before the work should have asked: TODO-019's `edit` (the Refined line of 2026-10-14 already named `edit()`; the question asked at about 18:00 cost about 60 h, by the session agent); DEBT-043 (its Refined line said "Size M for the slice"; carried three days and cut as L); DEBT-057 (its Refined line named `overpayment/orchestrator.rs` as a site, but a settled refund group with a negative total cannot pass the factories; that question is now open).

Reading: the batch merged more pull requests (19) with fewer extra rounds (13, was 21), fewer criticals only CI found (2, was 8) and almost no cancelled runs (2, was 25); the mean time open fell to 13.1 min. Three figures moved the wrong way: one pull request closed unmerged (was 0), two rounds came from a rebase alone (was 0), and a tag failed its release because a Done-when clause was left to a gate that ran only at release. Of the 6 005 minutes the queue took, pull requests were open for 248, and the longest stretch is one question sent inside a status message (TODO-019, about 60 h by the session agent); of the 8 folded rounds, 7 ran after the merge and 2 replaced a lane's report with "review skipped".

**The five questions**

1. A conflict avoided: #288 and #289 each wrote a slice line into `DEBT-046.md`; `merge.py` could not finish without a force push, so #289 was closed and reopened as #291 (FLOW-076). Rebase-alone rounds rose 0 → 2 (FLOW-039). The cause is added to FLOW-076.
2. Where it waited: TODO-019, about 60 h on a question asked inside status messages (by the session agent) — FLOW-078 is decided, working it shortens this. Publication, 1 h 44 min on the session's usage limit (by the session agent): nothing to change, it should be recorded. The v0.24.6 failure: 1 h 29 min and two pull requests (proposal A). #299's 33-min dry run is the price of the guarantee it adds: keep.
3. Simplify: 6 of 19 pull requests are records, was 7 of 17. Planning took #282, #283 and #295. Nothing to change.
4. Unused: 12 never run; keep all. `run-entry.sh` is three audits without a run; it is § 9's headless mode: keep.
5. Guides: +1 line and +71 words; one false statement not filed (the closing brief's position); `/dep-audit`'s line against § Release sweep caused an unasked upgrade (FLOW-054); three 🟡 that #284 wrote reached `main` (FLOW-077).

**Flow entries.** Settled, to close: none (FLOW-069 was closed by #284 within the batch). Re-checks written on the entries. Proposed: FLOW-080, FLOW-081, FLOW-082 (filed in the audit's pull request). FLOW-054 and FLOW-078 are the first to queue; FLOW-074 is flagged for the owner.

## Not in the records

Answered by the session agent and in no record. Each should have been written where named:

- #292's 73 min: "not known exactly", while waiting on TODO-019's answer. Still partly unanswered. Belongs in a comment on #292.
- The owner ran `just release -y` both times. Belongs in the release record (#297, or a comment on it).
- The usage limit delayed publication by 1 h 44 min. Belongs in the same record.
- #296 was the agent's own call, read from `/dep-audit`'s "must fix before release". Belongs in #296's body.
- The owner asked for "a small ticket" so that v0.24.7 would release; the agent chose DEBT-063. Belongs in #300's body and DEBT-063's last line.
- No sweep after #299 and #300, and "ready" was said directly. Belongs in the release record.
- The three questions sent inside status messages, and TODO-019's three-day wait on one of them. Belong in FLOW-078's Observed and on TODO-019 before its closure.
- `ensure_mutable` went out on "what are you waiting for?". Belongs on an entry (FLOW-082).
- The captures ran without the override. Belongs in FLOW-041's re-check.

Still unanswered: the owner's answer to the DEBT-039 wording question that #281 put to the owner. Local agent launches and skills run are in no record and were not counted.
