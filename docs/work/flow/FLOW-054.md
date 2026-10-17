# FLOW-054 — The first sweep of the guides found six contradictions between them

- Kind: quality
- Size: L
- Observed: `reviewer-guides`, new in this batch (FLOW-044), read about 45 guides in
  release-sweep mode on 2026-10-11 and was asked for its fifteen main findings. Six 🔴,
  each a guide against the document that owns the rule:
  1. `/dep-audit` says a CVE blocks the release and offers `npm audit fix`;
     `docs/workflow.md` § Release sweep says what a sweep finds is filed, not fixed, and
     the setup document says the skill never upgrades by itself.
  2. `docs/visual-proof-rules.md` puts "no visual impact" in the commit message;
     `docs/commit-rules.md` allows a title only. The same section says a proof is not
     required, then requires one.
  3. `docs/workflow.md` § 3 asks for a Vitest test "for rendering"; `docs/test-rules.md`
     and F18 forbid tests of rendering alone.
  4. `docs/test-rules.md` gives `npm run test`, `cargo test` and an unfilled
     `<your-check-command>` to run before a commit; `CLAUDE.md` forbids the native
     commands and § 5 says nothing is run by hand before a commit. `/visual-proof`
     Step 4 has `npm install` the same way.
  5. `/spec-writer` settles every question with the owner before `spec-reviewer` runs;
     § 3 asks for the reviewer first. It also has no headless branch.
  6. F25 and E1, E2, E4 give two conventions for the same stable ids.
     Eight 🟡: `/run-entry` headless both stops and goes back for another entry, and
     `/visual-proof` asks questions in a run with nobody to answer; F0, F1, F3 and F28
     disagree on which file may call a command; the setup line of the queue says "never
     edited by the agent" while `/plan-queue` writes it on the owner's yes; four names
     that do not exist, and "techdebt" for a debt entry; rules that live only in a
     reviewer's prompt (test names, E2E helpers, design tokens, English only); rules
     restated across `backend-rules`, `frontend-rules`, `test-rules`, `i18n-rules`,
     `CLAUDE.md` and the workflow; three template leftovers ("your project's …"); the tail
     of B37 now reading as part of B46. The sweep also lists what could be cut, guide by
     guide.
- Proposal: the six contradictions first, each settled in its owning document, in one
  pull request per pair of documents; then the 🟡 as the guides are next touched. Where
  the owning document is the one that is wrong, the owner says so.
- Costs: several pull requests of documentation, each read by the guides lane; the
  ceilings mean every addition needs a cut.
- Decision (owner, 2026-10-11): accepted for the six contradictions, next queue, each settled in its owning
  document; where the owning document looks wrong, the owner is asked that one question. The
  eight lesser points are fixed as their guides are next touched.
- Added 2026-10-11 (audit of the 0.24.3 batch, `flow-auditor`): four more statements a record shows false — the setup document says
  `scripts/merge.py` never force-pushes (FLOW-056) and that `docs/workflow.md` never says how code is
  written (its § 6 does); the workflow's usage-log convention says skills and agents are counted from the
  session transcript, which § 12 no longer uses; `CLAUDE.md` names `reviewer-security` alone for the
  release sweep where the workflow says the reviewer agents (FLOW-061).
- Re-checked 2026-10-13 (audit of the 0.24.5 batch, `flow-auditor`): partly moved. #275 fixed the `reviewer-security` setup line. The transcript sentence (line 466), § 6 and the queue line stand. #277 is a fresh instance of contradiction 2 (visual proof "not required"). Left.
- Re-checked 2026-10-17 (audit of the 0.24.7 batch, `flow-auditor`): decided, not worked. Contradiction 1 was acted on in #296 (by the session agent): an upgrade nobody asked for. Fresh instance of the queue line: #282, #295. Add `CLAUDE.md` § Opening and closing, "the closing brief is the PR body's first lines": all 18 bodies with a brief end with it. Left; the first to queue.
