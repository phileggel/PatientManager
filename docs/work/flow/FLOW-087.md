# FLOW-087 — just merge after a red watch rebases and pushes before its guard

- Kind: speed
- Size: S
- Observed: (`flow-auditor`, audit of the v0.24.8 batch) 5 `merge` runs within 5 s of a failing watch, through a `just watch-pr N …; just merge` chain (the session agent); 3 pushed a round (#309 27fdf69 and 8f4afc1, #312 4b7163d), and #308, #310, #311 merged with no comment read before. In `scripts/merge.py` the rebase comes before the green guard.
- Proposal: `merge.py` refuses before the rebase when the head's checks are red, the guard kept after it; `/run-entry` names the step as watch, then grade, then merge, never chained.
- Costs: a reorder, a test, a skill line. Risk: none on what lands.
