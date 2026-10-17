# FLOW-091 — A (c) grade without a source: 9 lines, 2 came back from the sweep

- Kind: quality
- Size: S
- Observed: (`flow-auditor`, audit of the v0.24.8 batch) 9 (c) lines in 6 pull requests cite no rule, file, measurement or decision (#308, #310, #312, #313 ×4, #314, #316); #308's touchpoints came back as FLOW-085 and #314's mapping as DEBT-069.
- Proposal: the PR description check flags a `(c)` line naming no path, rule id, pull request, run, or "owner".
- Costs: a regex in a CI check, and some false alarms. Protects: rejections that return as debt.
