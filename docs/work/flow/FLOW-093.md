# FLOW-093 — just batch-ends lists a version tag that never released

- Kind: effort
- Size: S
- Observed: on 2026-10-18, for the audit of the v0.24.8 batch, `just batch-ends 3` printed `v0.24.8`, `v0.24.7`, `v0.24.6`. v0.24.6 never released (its Windows E2E failed, FLOW-080), so `just flow-audit v0.24.7 v0.24.8 --previous v0.24.6` stopped: "gh release view failed" for v0.24.6. The session passed `--previous v0.24.5`, the start of the batch the last audit measured (with 0.24.6 folded in).
- Proposal: `batch-ends` lists a `v*` tag only when its release is published (or `batch/<date>` tags), so `/flow-audit` Step 1's three lines are always measurable.
- Costs: a check per tag in the recipe (a script then, FLOW-085's `justfile` point) and a test.
