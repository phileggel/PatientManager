# FLOW-089 — A rebase re-opens the review of a green, graded patch, and the rounds do not converge

- Kind: speed
- Size: S
- Observed: (`flow-auditor`, audit of the v0.24.8 batch) #313 round 5 was green and graded; its rebase (c2a6079, the same +66/−71 patch) started rounds 6–12. #316 round 2 was green; the rebase e841eda started rounds 3–5. 10 of 32 extra rounds.
- Proposal: owner's call. When a pull request's patch-id is unchanged since its last green round, the Review workflow posts "patch unchanged since round N" and skips the lanes; the tests still run (FLOW-039). Risk: those 10 rounds raised 3 🔴 and 2 🟡 graded (a), mostly wording, which would reach the release sweep instead.
- Costs: a patch-id step in `review.yml` and a test.
