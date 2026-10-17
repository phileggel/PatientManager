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
- Re-checked 2026-10-17 (audit of the 0.24.7 batch, `flow-auditor`): no Decision; not recurred (FLOW-019 was run by name). Left.
- Decision (owner, 2026-10-17): accepted: a `Decision` line makes a flow entry decided whatever watch it held (banked).
- Re-checked 2026-10-18 (audit of the v0.24.8 batch, `flow-auditor`): did not recur. Left.
