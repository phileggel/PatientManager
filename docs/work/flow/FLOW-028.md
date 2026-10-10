# FLOW-028 — `just watch-pr` ends on a cancelled job that only needs a re-run

- Kind: speed
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
