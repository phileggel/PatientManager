# FLOW-057 — The audit reads a failed run that was re-run as a success

- Kind: quality
- Size: S
- Observed: (`flow-auditor`, audit of the 0.24.3 batch) Review failures printed 2, counted 3; the batch's longest wait is invisible in `failures_by_workflow`. Attempt 1 of run 38131788006 on #261 failed and was re-run: the only re-run among the 119 runs of the window.
- Proposal: `flow-audit.py` counts the failed attempts of each run and prints the runs re-run.
- Costs: one more call per run with several attempts, a test.
- Decision (owner, 2026-10-11): accepted, for the next queue (banked, FLOW-062).
- Refined (2026-10-11, before queuing): `gh run list --json` has no attempt field: the attempts come from GitHub's REST list of runs (`run_attempt`), one paginated call. Done when: the failed attempts of a run that was re-run are counted in `failures_by_workflow`, and the runs re-run are printed; a test with a run of two attempts. Ships with FLOW-049 and FLOW-053.
