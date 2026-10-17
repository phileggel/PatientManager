# FLOW-088 — A fixup! that names a commit outside the branch is caught only at merge

- Kind: effort
- Size: S
- Observed: (`flow-auditor`, audit of the v0.24.8 batch) #309's `--fixup HEAD~N` named commits on `main`; `just merge` found it only at merge time, #309 was closed and #310 opened: 3 more rounds and 85 min.
- Proposal: `.githooks/pre-push` refuses a `fixup!` whose title matches no commit in `origin/main..HEAD`.
- Costs: a few hook lines and a test. Protects: a closed pull request per slip.
