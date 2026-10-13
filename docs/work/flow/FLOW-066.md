# FLOW-066 — No piece is given the job of emptying the queue once its batch has landed (gh#259)

- Kind: quality
- Size: S
- Observed: issue gh#259, filed by the owner on 2026-10-11. Three lines forbid the agent to edit `docs/work/queue.md` and none gives a piece the job of clearing it once its batch has landed: the landed references stay until the next `/plan-queue` replaces the list, and nothing says that this is the intended moment. On 2026-10-11 the header of the queue file still named two commands that no longer existed, and the release sweep raised it.
- Proposal: as the owner decided in the other project: `/flow-audit`, after the owner's yes, empties the queue of the batch it audited; the setup line of `docs/work/queue.md` becomes "never edited beyond what the owner validated". If `/plan-queue` stays the one that replaces the list here, the line says that instead, and the audit script stops counting a landed queue line as a dangling id.
- Costs: a step in `/flow-audit`, two setup lines.
- Decision (owner, 2026-10-11): accepted (banked, FLOW-062: the proposal is the owner's own, written in the issue). Not queued before it is refined.
- Re-checked 2026-10-13 (audit of the 0.24.5 batch, `flow-auditor`): banked or decided, not refined. Left.
