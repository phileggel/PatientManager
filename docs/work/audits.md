# Flow audits

What each batch measured, written after a release by an auditor that did not run the batch (`docs/workflow.md` § 12).
The hard points an audit finds are `FLOW-NNN` entries in `flow/`. Newest first.

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
