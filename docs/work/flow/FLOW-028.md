# FLOW-028 — `just watch-pr` ends on a cancelled job that only needs a re-run

- Kind: speed
- Size: S
- Observed: on 2026-10-05, PR #201 took four watches. Editing the pull request's
  description restarted the workflows listening to it and cancelled runs in progress;
  later a job was cancelled after 15 minutes in the queue, no runner having taken it
  (zero steps). The watch reported each as a failure and stopped; nothing restarted the
  jobs until `gh run rerun <run> --failed`.
- Again on 2026-10-05 and 06, during a GitHub Actions incident: #202 and #203 took three
  watches each, every job cancelled after 15 minutes without a runner.
- Proposal: owner's call. `watch-pr` re-runs once a job that was cancelled without
  running a step, and says so; a job that fails after running is still a failure. The
  description is edited before the push, not after, when the review outcome is known.
- Costs: a watch that writes to GitHub (a re-run), where today it only reads. Protects:
  about 20 minutes and three manual re-runs on such a pull request.
- Re-measured 2026-10-10 (audit of the 0.24.2 batch): 12 cancelled runs, was 32; 8 of them are "PR description"
  runs restarted by an edit of the description after the push. No job was left without a runner. The second half
  of the proposal (edit the description before the push) would have avoided the 8.
- Re-measured 2026-10-11 (audit of the 0.24.3 batch, `flow-auditor`): cancelled runs 0, was 12; no description edit restarted a run. The stop on
  #261 is a different case (FLOW-055).
- Re-checked 2026-10-13 (audit of the 0.24.5 batch, `flow-auditor`): cancelled runs 25, was 0. 11 are PR description runs; 13 commits had their description edited after the push, through `gh api` PATCH since `gh pr edit` fails (the session agent). The second half of its proposal (edit before the push) would have avoided those. Still no Decision line.
- Re-checked 2026-10-17 (audit of the 0.24.7 batch, `flow-auditor`): cancelled description runs 2, was 11, both from an edit after the push. No Decision. Left.
- Decision (owner, 2026-10-17): the second half only: the description is edited before the push; `watch-pr` keeps reading only (banked).
