# FLOW-068 — The guides give the todo entries to the human where the owner means them shared (gh#264)

- Kind: quality
- Size: S
- Observed: issue gh#264, filed by the owner on 2026-10-11. `docs/workflow.md` § 1 gives the todo entries to the human and § 2 heads their section "human-owned", then lists the few writes the agent may make. In another project an agent corrected a wrong statement in a todo entry, then reported it as a broken rule and asked the owner. On 2026-10-11, when this session asked which kind six issues should take, the owner answered: "Nothing is mine. You can create todo if user facing and needed."
- Proposal: the issue's own. § 1 and the heading of § 2 say the todo entries are shared and defined by being user-facing; § 2 says what stays the owner's inside one, if anything (the validated user value and done-when, the decision to queue); the list of permitted agent writes becomes "what the agent does not change without asking". The agent may create a todo entry when the matter is user-facing and needed.
- Costs: a few reworded lines in two guides at their ceiling.
- Decision (owner, 2026-10-11): accepted — "Nothing is mine. You can create todo if user facing and needed." Not queued before it is refined.
- Re-checked 2026-10-13 (audit of the 0.24.5 batch, `flow-auditor`): banked or decided, not refined. Left.
