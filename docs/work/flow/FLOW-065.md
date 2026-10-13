# FLOW-065 — The setup line of the entry run does not carry the duty to file what a task met (gh#258)

- Kind: quality
- Size: S
- Observed: issue gh#258, filed by the owner on 2026-10-11. The setup line of `/run-entry` says what it runs a task to and what it must never do, not that a run ends with what the task met and did not fix filed as entries. In another project six findings were filed only when the owner asked. Here the closing brief mentions it and the line does not.
- Proposal: the issue's own. The line of `/run-entry` carries the duty ("and files what it met and did not fix before the entry closes … nor a finding left in chat"), and the skill has the step, after the review findings are fixed and before the entry closes.
- Costs: one line of the setup document, one step in a skill at its ceiling.
- Decision (owner, 2026-10-11): accepted (banked, FLOW-062: the proposal is the owner's own, written in the issue). Not queued before it is refined.
- Re-checked 2026-10-13 (audit of the 0.24.5 batch, `flow-auditor`): banked or decided, not refined. Left.
