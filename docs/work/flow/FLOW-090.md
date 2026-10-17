# FLOW-090 — § 8's stop has no tool, and it was not applied

- Kind: quality
- Size: S
- Observed: (`flow-auditor`, audit of the v0.24.8 batch) #313: 7 red Review rounds and 3 h 41 min open, no "split?" question in any record; the session agent says the § 8 count was not applied. FLOW-074: 5 red rounds over #309 and #310. A local lane ran 64 min in the background.
- Proposal: `watch-pr` counts a gate's red rounds on the pull request and, at the third, exits with its own code telling the agent to stop and ask "split?"; a local lane run gets a time limit.
- Costs: a counter reading the pull request's runs, and a stop that waits for the owner. Protects: a 12-round S entry.
