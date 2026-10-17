# FLOW-080 — A Done-when clause left to a gate the pull request does not run closes the entry, and the release finds it

- Kind: quality
- Size: S
- Observed: (`flow-auditor`, audit of the 0.24.7 batch) #285 closed FLOW-019 with its Windows clause "proven there, not here". Release run 39013736595 then failed in Windows E2E (DEBT-068); v0.24.6 never released, and #298, #299 and v0.24.7 followed. #299 added `e2e/**` and `package.json` to the dry run's paths; `package-lock.json` is not among them.
- Proposal: § 3 step 10 says an entry whose Done when names a gate the pull request did not run stays open until that gate has run, or the pull request makes that gate run. Add `package-lock.json` to the dry run's paths.
- Costs: an entry open across a release, or a 33-min dry run on such pull requests. Protects: a tag that cannot release, and the notes gap of FLOW-081.
