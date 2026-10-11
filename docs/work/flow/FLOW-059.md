# FLOW-059 — An acceptance test was not seen failing

- Kind: quality
- Size: S
- Observed: (`flow-auditor`, audit of the 0.24.3 batch) #261, in its own words: its rollback tests were "not seen failing against the old code" (`docs/workflow.md` § 3 step 3, confirm red). The guarantee of the batch's one `fix` rests on tests nobody saw fail.
- Proposal: each Done-when line of a pull request names the commit or state where its test was red, or says why it could not be. The integration test of #261 runs on a real database and could have run on the old code.
- Costs: a few minutes per entry.
- Decision (owner, 2026-10-11): accepted, for the next queue (banked, FLOW-062).
- Refined (2026-10-11, before queuing): ships with FLOW-059, FLOW-060, FLOW-061 and FLOW-062, one pull request of guides, size M together. `docs/workflow.md` (495) and `CLAUDE.md` (69) are exactly at their ceiling and the four rules need about twelve lines: the cut is the eight-line section "Authoring rule — no compound shell in agent / skill prompts" of the workflow, which repeats the first bullet of "Shell calls". Done when for this entry: `docs/workflow.md` § 3 step 8 and `/run-entry` Step 8 ask each Done-when line of a pull request body to name where its test was seen red, or why it could not be.
