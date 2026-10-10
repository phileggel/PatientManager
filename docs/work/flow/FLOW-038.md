# FLOW-038 — `just watch-pr` right after a push reports the checks of the commit before

- Kind: quality
- Observed: on 2026-10-10, three times (PR #220 after its second push, PR #224 after its
  rebase, PR #220 again), `just watch-pr` run in the same command as the push answered
  "ALL CHECKS GREEN" on the previous head within seconds: GitHub had not yet attached a
  run to the new commit. `just merge` then refused, rightly, and a second watch was needed.
  Nothing wrong merged, but a green line was printed for a commit nobody had checked.
- Proposal: `watch-pr` compares the pull request's head with the local branch head and
  waits until GitHub knows the pushed commit before it reads any check.
- Costs: a few lines and a test in `scripts/watch-pr.py`. Protects: a "green" that means
  the commit before, read by an agent that then reports it.
- Decision (owner, 2026-10-11): accepted and queued.
