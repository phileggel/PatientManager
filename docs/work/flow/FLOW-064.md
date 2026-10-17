# FLOW-064 — Nothing says which skill owns the task list when the queue run runs an entry (gh#257)

- Kind: quality
- Size: S
- Observed: issue gh#257, filed by the owner on 2026-10-11. `/run-queue` Step 1 creates one task per queue line, and `/run-entry` Step 1 one task per step; nothing says how the two compose when the first runs the second. In another project the agent picked one. Here, in the batch of 2026-10-11, the session kept the queue-level tasks only.
- Proposal: the decision taken in that project: `/run-queue` owns the task list during a batch; `/run-entry` creates no task when a batch runs it and keeps its own list when run alone. The two setup lines say so, and each skill says it at its `TaskCreate` step.
- Costs: two lines of the setup document and one sentence in each skill; `/run-entry` is at its ceiling, so its sentence needs a cut.
- Decision (owner, 2026-10-11): accepted (banked, FLOW-062: the proposal is the owner's own, written in the issue). Not queued before it is refined.
- Re-checked 2026-10-13 (audit of the 0.24.5 batch, `flow-auditor`): banked or decided, not refined. Left.
- Re-checked 2026-10-17 (audit of the 0.24.7 batch, `flow-auditor`): banked, not refined, left out of the queue a second time. Left.
