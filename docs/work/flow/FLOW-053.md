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
