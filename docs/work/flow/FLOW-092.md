# FLOW-092 — The session keeps CLAUDE.md as it read at its start, and its agents inherit it

- Kind: quality
- Size: S
- Observed: (`flow-auditor`, audit of the v0.24.8 batch) the session agent says `CLAUDE.md` was not reloaded after #306, #308, #310, #311 and #313 changed it; the auditor, launched at the batch's end, received v0.24.7's text (no `AskUserQuestion`, "Before every release").
- Proposal: `/run-queue` re-reads `CLAUDE.md` and the changed guides after a guides pull request merges; an agent launch passes no copy of `CLAUDE.md` older than `main`.
- Costs: one read per guides merge. Protects: the batch and its agents working the rules the batch just wrote.
