# FLOW-034 — An unpushed branch stacked on a pushed one avoided the rebase dead end

- Kind: speed
- Observed: three features each removed a line from the same list in
  `arch-allowlist.json`; two pull requests opened side by side would have conflicted, and
  a conflict on a pushed branch has no way through (FLOW-026). The agent wrote each
  feature on a local branch above the previous one, ran the harness and the reviewers
  there, and pushed only after the one below had merged (a local rebase, never a
  force-push). #202, #204 and #205 merged within 27 minutes of each other.
- Proposal: keep, and write it down: `docs/workflow.md` § 11 allows a branch that is not
  pushed yet to sit on a branch in review, rebased onto `main` before its first push;
  the reviewers are given the last commit only.
- Decision (owner, 2026-10-06): accepted. The pattern goes into `docs/workflow.md` § 11.
- Costs: a reviewer prompt that names a commit instead of a branch. Protects: the waiting
  time of a queue of small pull requests on one file.
