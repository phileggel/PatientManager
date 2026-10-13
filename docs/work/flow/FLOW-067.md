# FLOW-067 — The audit's five questions never ask for a missing tool or a finding owed to another repository (gh#260)

- Kind: quality
- Size: S
- Observed: issue gh#260, filed by the owner on 2026-10-11. Of the five aims the owner gives a flow audit, `docs/workflow.md` § 12 covers four; nothing asks what tool the batch lacked, and nothing sends a finding to the repository that owns it. Another project's first audit produced four findings no flow entry there could hold. Here, the audit of the 0.24.3 batch listed six issues "owed" outside its proposals.
- Proposal: the issue's own. A sixth question: what did the batch check or do by hand that a tool should do, and which finding belongs to another repository — a script, hook or recipe owed here, an issue filed there. One clause on `flow-auditor`'s setup line: a generic piece a sibling repository words differently is a finding.
- Costs: a few lines in § 12 and in the auditor's prompt; § 12 is at the workflow's ceiling.
- Decision (owner, 2026-10-11): accepted (banked, FLOW-062: the proposal is the owner's own, written in the issue). Not queued before it is refined.
- Re-checked 2026-10-13 (audit of the 0.24.5 batch, `flow-auditor`): banked or decided, not refined. Left.
