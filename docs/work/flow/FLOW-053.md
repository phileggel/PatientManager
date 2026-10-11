# FLOW-053 — Release sweep of 2026-10-11: what the infra lane found in the tooling

- Kind: quality
- Size: S
- Observed: beside FLOW-051 and FLOW-052, `reviewer-infra` in release-sweep mode
  raised, on the tooling this batch wrote: 🟡 `scripts/flow-audit.py` reads at most 500
  issues and `scripts/work-queue.py` 200, and neither says when the list was cut, while
  pull requests and runs are covered by `truncated`; 🟡 `/file-entry` names
  `just queue new`, which fails on a title of several words until FLOW-050 is fixed;
  🔵 `scripts/watch-pr.py` falls back in silence to watching whatever head GitHub
  gives when the local commit cannot be read, the behaviour FLOW-038 removed;
  🔵 `flow-auditor` is read-only by its prompt alone, with a general `Bash` grant;
  🔵 the script tests print "arch-allowlist.json rewritten" from a test's temporary
  tree, which reads as if the real file had moved. `docs/work/queue.md` still names
  `/whats-next`: the owner's file.
- Proposal: issues join `truncated`, with one constant for the limits; `watch-pr` says
  in one line when it does not know the commit to wait for; the test's message goes to
  the test's own output. The `/file-entry` line follows FLOW-050.
- Costs: a few lines and their tests in three scripts.
- Decision (owner, 2026-10-11): accepted, for the next queue.
- Refined (2026-10-11, before queuing): the limits are 200 issues in `scripts/work-queue.py` and 500 in `scripts/flow-audit.py`. Done when: issues join `truncated`, with one constant per script; `just watch-pr` says in one line when it cannot read the local commit; the script test that prints "arch-allowlist.json rewritten" keeps that message out of the suite's output. The `/file-entry` line follows FLOW-050. Ships with FLOW-049 and FLOW-057.
- Added 2026-10-11 (FLOW-051's review): the test of the deny list reads each rule as a glob and does not
  call the tool's own matcher. Done when, for this point: in a session started after the edit, one
  harmless command a new rule should refuse (`python3 scripts/release.py --help`) is tried once and its refusal
  is noted in the pull request, as was done on 2026-10-04 for `Bash(*name*)`.
