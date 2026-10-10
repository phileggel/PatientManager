# FLOW-032 — A contract or a spec read for the first time costs the feature that touches it

- Kind: speed
- Observed: `contract-reviewer` ran on three contracts because a feature changed one
  command in each. It returned 4, 1 and 2 critical findings, none caused by the change
  (wrong argument types, error codes that exist nowhere, "hard-deletes" for a soft
  delete), and `spec-checker` found 8 of 30 and 4 of 23 rules partial before the release.
  Each cost 20 to 30 minutes of triage, corrections and debt (DEBT-034, 037, 040, 042,
  045, 046). The findings were real: two cascades and one rule are not enforced.
- Proposal: owner's call. Keep the reviewers as they are, and pay the drift once: an entry
  that regenerates the 13 contracts with `/contract` and runs `spec-checker` on every
  spec, before the next feature work. Until then a feature corrects the commands it
  touches and files the rest, as this batch did.
- Decision (owner, 2026-10-06): accepted. One entry regenerates the 13 contracts with
  `/contract` and runs `spec-checker` on every spec, before the next feature work.
- Costs: one batch-sized entry with nothing a user sees. Protects: about half an hour
  per feature, and contracts a second surface (TODO-013) can be written against.
