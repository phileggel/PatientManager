# FLOW-059 — An acceptance test was not seen failing

- Kind: quality
- Size: S
- Observed: (`flow-auditor`, audit of the 0.24.3 batch) #261, in its own words: its rollback tests were "not seen failing against the old code" (`docs/workflow.md` § 3 step 3, confirm red). The guarantee of the batch's one `fix` rests on tests nobody saw fail.
- Proposal: each Done-when line of a pull request names the commit or state where its test was red, or says why it could not be. The integration test of #261 runs on a real database and could have run on the old code.
- Costs: a few minutes per entry.
