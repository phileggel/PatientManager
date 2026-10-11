# FLOW-056 — `just merge` pushes the folded commit with force, and CI runs a full round on a pull request already merged

- Kind: effort
- Size: S
- Observed: (`flow-auditor`, audit of the 0.24.3 batch) 2 of the 5 extra rounds (#252 at 08:56:36, #261 at 12:31:07 UTC), each with Quality, E2E and Review. On #261 the reviewer sessions ran again, on the account that had just met its limit, and their comments now link that post-merge run. Three guides say force-pushing never happens (`docs/agentic-setup.md` on `scripts/merge.py`, `CLAUDE.md` rule 1, `docs/workflow.md` § 8); `merge.py` line 206 pushes with `--force-with-lease`.
- Proposal: the workflows end at once when the pull request is already merged; the three guides say what `merge.py` does.
- Costs: a few lines per workflow. Risk: none on the tree — `merge.py` already compares it with the one tested.
- Decision (owner, 2026-10-11): accepted, for the next queue (banked: asked only what is not trivial, FLOW-062).
