# Flow audits

What each batch measured, written after a release by an auditor that did not run the batch (`docs/workflow.md` § 12).
The hard points an audit finds are `FLOW-NNN` entries in `flow/`. Newest first.

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

---

## Measured — the 0.24.5 batch, with 0.24.4 folded in (2026-10-11 13:29 UTC → 2026-10-13 04:26 UTC)

Written by `flow-auditor` and revised once with the session agent's answers. Figures come from `logs/flow-audit.json` (`just flow-audit v0.24.3 v0.24.5 --previous v0.24.2`; `truncated`: nothing), each beside the batch before. "Counted" marks what the auditor counted from the pull requests, the runs (`gh run list`) or `logs/usage.log`. "The session agent says" marks an answer: evidence, not a conclusion. The invoking prompt gave the three tags and the figures file and nothing else.

- **Pull requests merged:** 17 (#242, #265–#280), was 23. Lines added: 1 407, was 3 752. By type: 8 docs, 5 chore, 2 fix, 1 ci, 1 other; was 13 docs, 6 chore, 2 refactor, 1 ci, 1 fix. None closed without merging, was none.
  - Counted: "other" is #242. The script does not read Dependabot's `chore(deps):` title as a type.
  - Counted: 9 are work (#242, #267, #270–#275, #277, #280) and 7 are records (#265, #266, #268, #269, #276, #278, #279), was 11 and 12.
- **Opening to merging:** median 7.6 min, was 0.7; mean 143.5 min, was 11.3.
  - Counted: four pull requests hold 2 353 of the 2 440 minutes spent open: #242 1 082 (opened before the window, waiting for its turn in the queue), #275 702, #274 407, #273 162.
  - Counted: work pull requests, median 25.3 min; record pull requests, about 0.7 min each.
- **How long the queue took:** 2 468.0 min from the first opening to the last merge, was 869.5.
  - Counted, from the usage log, three stretches with no tool run while a pull request had a red Review:
    - **#275, 05:40 → 16:32 UTC, 10 h 52 min.** The session agent says it stopped under the three-reds rule of § 8, the owner answered in chat at about 16:30, and the fix was pushed then. The runs disagree on the count: before 05:40 #275 had two red Review runs (4e6a773, 33d70e5); the third (191d8ac) started at 16:33, after the answer.
    - **#274, 22:38 → 04:56 UTC, 6 h 18 min.** The session agent says the owner's machine paused overnight.
    - **#273, 20:04 → 22:13 UTC, 2 h 9 min.** The session agent says it was waiting on #272's watch while the machine paused.
  - Counted: v0.24.5's release workflow was green at 19:50 UTC and the release was published at 04:26 UTC, 8 h 36 min later. For v0.24.4 the gap was 12 s. The session agent says the agent published on wake, after the machine paused overnight.
- **CI rounds:** 38 for 17 branches, was 28 for 23; 21 beyond the first, was 5. Counted causes of the 21:
  - 11 were fixes after a critical that only CI found: #270 1, #273 4, #274 1, #275 5.
    - Four of those pushes were followed 40–71 s later by a second push that cancelled their runs (#273 c7bdd61 and a6628df; #275 aca2ff9 and efe0c7c).
    - The session agent says each second push carried fixes a local guides or infra pass had asked for, and no lane read them again before the push.
  - 6 were the folded commit `just merge` pushes (#242, #270, #273, #274, #275, #277). Five of them ran after the merge; on #277 the fold was tested before the merge.
  - 2 were fixes after CI warnings or suggestions (#273 e296aa0, #277 dcb1ed0). The session agent says no local infra pass read e296aa0 before its push; its CI round raised two infra criticals.
  - 1 added scope: #270 b3d564c carried the FLOW-069 entry, at the owner's request (comment of 16:10 UTC).
  - 1 was a fixup on Dependabot's branch (#242: moving the "Install just" step to the same pin), pushed 6 s after the agent's rebase.
  - 0 came from a rebase alone, was 0.
- **Run times (median of green runs):** Quality 2.7 min (2.6), Review 1.9 (1.3), E2E 6.6 (6.5), Codec Gate 1.7 (1.8), PR description 0.1 (0.1). Release dry run 31.1 is new; it ran on #242 only.
- **Failed runs on pull requests:** Review 8, was 3, of which 1 is an earlier attempt of a run that was re-run (#274); nothing else failed. Cancelled: 25, was 0 — PR description 11, Review 5, E2E 3, Quality 3, Codec Gate 2, Release dry run 1.
  - Counted: the 14 cancelled runs that are not PR description runs all come from a push followed by another within 6–71 s.
  - Counted: 13 commits carry two or more PR description runs, so the description was edited after the push. The session agent says the edits went through `gh api -X PATCH …/pulls/N`, because `gh pr edit` fails on GitHub's deprecation of project cards (#270).
  - Counted: on `main`, the push runs of 579cffb, 47f5aee and 37419eb were cancelled within seconds of the merge. The script counts pull-request runs only, so these are not in the figure. Cause not known.
- **Entries:** 20 filed (17 flow, 3 debt), was 18; 15 closed (12 flow, 3 debt), was 12.
  - Counted, the queue: 12 references (11 entries and gh#242), all 12 shipped.
  - Counted, outside the queue:
    - DEBT-059 (#267, "fix now", owner);
    - FLOW-051 (#270). The queue the owner validated that day had put it in the batch after, "to refine first";
    - DEBT-039 (#280). The session agent says the owner named it after `just release -y` printed "No releasable commits", so that the release would carry a changelog line.
- **Each entry beside its size:** past its size, 0, was 1.
  - FLOW-055 (M): 1 pull request, 7 rounds.
  - Counted: the figure gives a bundle's rounds to each entry it names. FLOW-059 to FLOW-062 each show #275's 7 rounds, and FLOW-049, 053 and 057 each show #274's 3. Summed over entries the figure gives 54 rounds; the batch had 38.
- **Open at both ends:** issues 6 → 6, and each now has an entry (FLOW-063 to FLOW-068, #269). Dependabot pull requests 1 → 0 (#242 merged).
- **Tools (`logs/usage.log`, from 13:42:55 UTC):** 667 runs, was 725. Most run: `rule-homes` 137, `changed-scope` 111, `scoped-checks` 95, `privacy-check` 92, `work-queue` 33, `watch-pr` 29, `arch-check` 26, `check` 25, `branch` 22, `merge` 20, `harness` 16.
  - Failures: 38, was 25 — `rule-homes` 11, `watch-pr` 8, `harness` 6, `check` 5, `merge` 3, `privacy-check` 2, `scoped-checks` 2, `release` 1.
  - Counted: the 8 `watch-pr` exits match, by time, the 8 red Review rounds it reported. They are answers, not faults of the tool.
  - Counted: 2 of the 3 `merge` failures are on #242, where the Dependabot convention expects the first `just merge` to stop.
  - The `release` failure was at 18:31:51 UTC on 2026-10-12. The session agent says the owner ran `just release -y` and it refused: no releasable commits.
  - No outcome, stated by runs alone: `coverage-fe` 9, `format` 8, `coverage-be` 6, `generate-types` 1, `rerun-failed` 1.
  - Never run: 14, was 13 — `clean-branches`, `clean-db`, `flow-audit.py`, `migrate`, `prepare-sqlx`, `regen-fixtures`, `release-notes.py`, `review-path.sh`, `review-stop-reason.py`, `run-entry.sh`, `start-app.sh`, `stat`, `test-scripts`, `visual-proof-capture.mjs`.
  - `release-notes.py` and the two `review-*` scripts run in CI only. The script tests run in CI's PR checks job (#271). `flow-audit.py` ran after the window, so § 12's "nothing of it runs during a batch" was kept this time.
- **Agents and skills:** CI reviewer comments, counted in their last state: 20 on 10 pull requests (infra 8, guides 5, arch 3, frontend 3, backend 1). Each comment is overwritten by the next round (FLOW-058), so the reports of earlier rounds are not countable. Local launches and skills run: not counted.
- **Guides:** 39 documents, 4 746 lines; was 39 and 4 746. `/file-entry` 24 → 25; `docs/workflow.md` 495 → 494.
  - Counted, words in the 39 guides: 39 256 → 39 692 (+436). `reviewer-guides` grew 494 → 582 words on the same 33 lines, `review-protocol` 664 → 739, `docs/workflow.md` 5 029 → 5 106, `reviewer-infra` 1 333 → 1 378, `/run-entry` 1 180 → 1 222, `CLAUDE.md` 1 566 → 1 602.
  - Documents naming a path that does not exist: 17, unchanged.
- **Defects found before merge, by reviewers (from the bodies):**
  - #267: an error the application builds still wrote its message into the log.
  - #271: a CI timeout too tight for an added download; a test that inherited `GIT_*`.
  - #273: a quote's later lines dropped; Rule 2 lost two conditions in a cut made for the ceiling (local guides 🔴); the session's words printed unfiltered.
  - #275: the setup line still gave `reviewer-security` "the whole code" (local guides 🔴); rules lost with a section cut for the ceiling; seven lane descriptions promising a full audit; `git describe` not on the allow list.
  - #280: older drift in the fund contract (b, DEBT-040).
- **Criticals only CI found:** 8, was 2 (guides 5, infra 3), plus 1 false positive (#274, graded with an inline comment).
  - #270 (infra): the `gh api` denials let a write through when a flag is written with `=`. The owner settled it the other way: the denials were removed.
  - #273 (guides): the skill's wait sat outside the time budget while § 8 stated no exception.
  - #273 (infra): a mixed run, one lane usage-limited and another red, still exited 6.
  - #273 (infra): `gh run rerun` is not on the allow list.
  - #274 (guides): `CLAUDE.md` rule 1 named the branch form without the filing exception.
  - #275 (guides, round 1): a sweep scope that no step produces.
  - #275 (guides, round 2): "banked" scoped to the wrong line.
  - #275 (guides, round 3): "banked" written on the Decision line that § 12 gives to the owner.
  - Counted: at least 3 were on text that an earlier CI round of the same lane had passed. `gh run rerun` is in #273's skill at 617e8e3 and cc9eb8d. The round-3 contradiction of #275 is in 4e6a773 (workflow lines 156 and 417). On #274 the same commit's first attempt raised the false positive instead of the real critical.
  - § 11's figure against this: the four pull requests with a CI-only critical added 139, 186, 168 and 47 lines. All are far under 400 per lane.
- **Reviewer claims rejected with a source:** 24 in 8 pull requests (counted). 3 cite no rule, file, measurement or decision:
  - #273: "the first local pass asked for it";
  - #274: "it contrasts the two forms";
  - #275: "seven descriptions → (c)".
- **CI findings with no grade in the body or a comment (§ 7):** 5, all suggestions, was 5.
  - #274 `reviewer-guides`, last round: `CLAUDE.md` at its ceiling, `docs/workflow.md` headroom, a run-on line in `reviewer-guides`.
  - #275 `reviewer-guides`, last round: the output template has no `## Files read` slot; a quoted example to drop.
- **Defects that reached `main` and were found later:**
  - The release sweep (#278, FLOW-071) found 3 warnings in guides this batch wrote: "the security release sweep" in `CLAUDE.md` § Commands; the trivial-question rule without its criterion; "the sweep's pull request" that no step creates.
  - FLOW-070: a corrected size is invisible to the audit. Seen while writing #275.
- **Rules not followed:**
  1. **`CLAUDE.md` § Where things are, Agents: "re-run on the fixes until no 🔴, then push" (§ 7).**
     - The session agent says the second push of each pair (#273 cc9eb8d and 5e23c80; #275 33d70e5 and 0638f6f) was written to a local lane's findings and not re-read before the push. It also says e296aa0 (#273) went out with no local infra pass because it fixed only a CI 🟡 and 🔵. The rule makes no exception for a fix of a warning.
     - Cost: 14 cancelled runs. 4 of the 11 fix rounds were pushes that no lane had read. e296aa0's round raised two infra criticals; 33d70e5's raised #275's round-2 critical.
     - Counter-argument: at least one of those criticals (`gh run rerun`) was on older text, which a re-read of the delta would not have reached. It survives in part.
  2. **§ 7, "a CI finding the local run missed → a rule in that reviewer's prompt, same PR".**
     - #273's two infra criticals left `reviewer-infra.md` untouched; #275 added a rule for round 1 only, not for rounds 2 and 3.
     - Counter-argument: rule 1 of `reviewer-guides` (contradiction) already covers round 3. That survives, and it points to the lane's instability rather than a gap in its prompt (FLOW-072).
     - Cost: 4 of 8 CI-only criticals left the local lanes as they were.
  3. **§ 3 Release: "the release sweep … and only then does it tell the human the release is ready".**
     - The session agent says the owner was told "ready" at about 17:30 UTC (after #278) and again at about 19:20 UTC (after #280), with no sweep after #280. Only #280's three CI lanes read its diff.
     - #280 is v0.24.5's only changelog line, added because `just release -y` had refused for lack of one.
     - For v0.24.4, tagged 11 min after #267, whether any sweep ran is not known.
  4. **`CLAUDE.md` § Standards and `docs/visual-proof-rules.md` line 5: any `.tsx` change carries screenshots.**
     - #277 changed `ImportExcelPage.tsx` with none. Its body says the rules document names only component or layout changes as triggers. Line 5 says "any change that touches a `.tsx` … MUST", and the "not required" path still asks for one screen that consumes the code.
     - Cost: small (one log argument), but the pull request states a guide says what it does not.
  5. **§ 3 Banked and `CLAUDE.md` § Who decides what: only an ambiguity or a deep choice is the owner's, a question being asked "where the options differ in … what is seen".**
     - DEBT-039 said "a visible change, so the wording is the owner's". The session agent says the agent chose "Identifiant déjà utilisé par une autre caisse" itself, copying the duplicate-IBAN message, under the rule of 2026-10-12.
     - By that rule's own criterion, a new message a user reads is the owner's.
     - Cost: a user-facing message validated by nobody but the agent, against the entry's own line.
  6. **§ 2 / § 8, the queue as validated.**
     - FLOW-051 was worked first in the batch while the queue placed it in the batch after, to refine first. No owner's yes is in the records, and the session agent does not know (before its session).
     - Cost: its unrefined scope (the `gh api` denials) became a CI critical that the owner settled during the work.
  7. **`CLAUDE.md` Core rule 1: the branch type is the commit type.**
     - #277's branch is `fix/debt-060-…` and its title is `chore:`. No cost found.
- **Guide statements a record shows false, not already filed:** 2.
  1. `docs/agentic-setup.md`, `.claude/settings.json`, "Never: allows what `CLAUDE.md` forbids". On #270 the owner ruled that another spelling past a deny rule is not a finding, and removed the `gh api` write denials. `Bash(gh api *)` stays allowed and can move a ref; the session agent's answer shows the agent uses it to write (PATCH on pull requests).
  2. `docs/workflow.md` § 3 Release says "the human runs `just release` when they choose. It computes the version from the merged titles". It does not say what a batch with no `feat` or `fix` does. Here the tool refused, and a fix was added after the sweep.
  - Already filed: FLOW-054 (§ 6 of the workflow; the queue line; the transcript sentence, line 466), FLOW-056 (`merge.py` force-pushes: 6 times this batch), FLOW-071 (3).
- **Generic pieces of `docs/agentic-setup.md` against their line:** 60 lines. 6 are contradicted by a record:
  - `scripts/merge.py` (6 force-pushes);
  - `docs/workflow.md` (§ 6);
  - `docs/work/queue.md` (#269 wrote it on the owner's yes);
  - `.claude/settings.json` (#270);
  - `CLAUDE.md` (FLOW-071, a restated rule);
  - `flow-auditor` "nor writes a file": in this audit a `git fetch` created a ref, `refs/remotes/audit/pr275`, which the auditor deleted at once. Read-only holds by prompt alone (FLOW-053's 🔵).
  - `scripts/release.py`, "never run by the agent": the session agent says the owner ran all three runs from the terminal (the 18:31 refusal named; the others consistent). Not contradicted, on an answer.
  - The other 53: no pull request contradicts them; not verified line by line.
- **The owner's answers written into entries:** 16 dated Decision lines (counted): 8 in #266, 6 in #269, 1 in #270, 1 in #279.
  - 7 more answers live only in pull request bodies or comments: two on DEBT-059 in #267; the 0.24.4 fold in #268; "too big, refine first" in #269; the `gh api` ruling in #270; "trivial question is yours" in #275; DEBT-039 named in #280.
  - Asked during the work: 5 — #270 (twice), #275, #279, #280.
  - Two that the reading before the work should have asked:
    - #275: FLOW-062's own proposal said "banked on its Decision line" against § 12. The session agent says the answer was awaited from 05:40 to about 16:30 UTC, the batch's longest stop.
    - #270: the `gh api` scope of an entry worked unrefined.

Reading: the batch merged fewer and smaller pull requests (17, 1 407 lines) but spent four times the CI rounds (21 beyond the first, was 5), and 11 of those 21 were fixes after criticals that only CI's guides and infra lanes found (8, was 2), all on pull requests under 190 lines. The mean time open rose to 143.5 min. By the session agent's answers, the long gaps were the owner's machine pausing overnight (#274, #273, the publication) and one wait of about eleven hours for an owner's answer on #275, a question the refinement could have asked. The guides kept their line count exactly (4 746) and grew by 436 words, and the release's one changelog line was a fix added after the sweep, because the release tool found nothing releasable.

**The five questions**

1. A conflict avoided: nothing to change — 0 rounds from a rebase alone, was 0.
2. Where it waited:
   - #275, 10 h 52 min on the owner's answer (by the session agent), which a question at refinement would have removed. That step is already FLOW-069's decision; nothing new.
   - #274 6 h 18 min, #273 2 h 9 min and the publication's 8 h 36 min: the machine paused (by the session agent). That is outside the flow; nothing to change.
   - 25 cancelled runs, 14 from a second push that no lane had read: rule 1 above, and FLOW-072.
3. Simplify: 7 of 17 pull requests are records, was 12 of 23. The release preparation still took two record pull requests an hour apart (#278, #279), what FLOW-069's decision means to stop. Nothing new.
4. Unused: 14 never run, keep all. `run-entry.sh` has now gone two audits without a run (as `next-todo.sh` before): keep, re-check. `visual-proof-capture.mjs` did not run although #277 changed a `.tsx`; that is the rule's failure, not the tool's.
5. Guides: 2 false statements not filed; 4 746 → 4 746 lines but +436 words; two cuts made for a ceiling removed a rule's conditions. FLOW-073.

**Flow entries.** Settled, to close: none. Watches re-checked on their entries. Proposed: FLOW-072, FLOW-073, FLOW-074 (filed in the audit's pull request).

## Not in the records

Still unanswered:

- Whether a sweep or `/dep-audit` ran after #267 and before v0.24.4. The session agent: not known (before its session).
- Who decided FLOW-051 would run in this batch. The session agent: not known. It belongs on FLOW-051's Decision line or in the queue file.
- Why the push runs on `main` of 579cffb, 47f5aee and 37419eb were cancelled within seconds. Not asked; not known.
- Local agent launches and skills run: in no record; not counted.
- The count behind #275's stop: the session agent's answer (three reds by 05:40) disagrees with the runs (two by 05:40, the third at 16:33). Not resolved.

Answered by the session agent, and in no record. Each should have been written where named:

- The #275 stop and the owner's answer at about 16:30 UTC. #275's body records the answer but not the wait. Belongs in a comment on #275.
- The machine's overnight pauses (#274, #273, the publication of v0.24.5). Nothing records them. Belongs in the pull request comment, or at least the publication time in the release preparation's record.
- No local lane read the second pushes or e296aa0. Belongs in #273's and #275's bodies, beside the fix lines.
- `just release -y` refused at 18:31, and DEBT-039 was named to fill the changelog. Belongs in #280's body and DEBT-039's last line.
- "Ready" told at about 17:30 and about 19:20 UTC, no sweep after #280. Belongs in the release preparation's record (#278 or a comment on it).
- The agent chose DEBT-039's wording. #280 names the precedent but not who chose.
- Descriptions edited through `gh api` PATCH after `gh pr edit` failed. #270's comment names the failure, not the workaround.

About this audit: the `CLAUDE.md` injected into the auditor's context was the text before #275; the auditor read the file on `main`. A `git fetch` by the auditor created the ref `refs/remotes/audit/pr275`, deleted at once; nothing else was written.
