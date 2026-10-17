# FLOW-081 — The release notes of a version skip the sections of a tag that never released

- Kind: quality
- Size: S
- Observed: (`flow-auditor`, audit of the 0.24.7 batch) v0.24.7's page has 1 line. `CHANGELOG.md` 0.24.6 has 4 fixes that no published release shows.
- Proposal: `release-notes.py` prints every section since the last published release. Amending v0.24.7's page now is the owner's call.
- Costs: a few lines and a test in a CI-only script; longer notes after a failed tag. Protects: what a user is told changed.
- Decision (owner, 2026-10-17): accepted; v0.24.7's release page is left as it is (banked).
