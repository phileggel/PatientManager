# FLOW-075 — A decided watch entry reads as not ready in the queue

- Kind: quality
- Size: S
- Observed: on 2026-10-14, after PR #282 queued FLOW-019, `just queue` printed it as
  "waits on: nothing to do: a watch entry". FLOW-019 carries a `Watch` line (2026-10-04)
  and a `Decision` line (2026-10-12); `scripts/work-queue.py` checks the watch first
  (`flow.watch`, line 178) and never reads the decision, so `/run-queue` would skip a
  queued, decided entry as not ready. Worked around by running `/run-entry FLOW-019` by name.
- Proposal: a flow entry with a `Decision` line is decided whatever watch it held; the
  watch reason applies only to an undecided one. A test in `scripts/tests/` for an entry
  with both lines.
- Costs: one line and a test.
