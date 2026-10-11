# FLOW-052 — The CI reviewer runs with the pull request's own settings and hooks

- Kind: quality
- Size: S
- Observed: the release sweep of 2026-10-11 (`reviewer-infra`, 🔴). `review.yml` takes
  `.claude/agents` and four scripts from the base branch, so a pull request cannot
  soften the reviewer that grades it. `.claude/settings.json`, `.claude/hooks`,
  `.claude/rules`, `.claude/skills` and `CLAUDE.md` stay as the pull request has them,
  and the session starts beside the subscription token and the job token: a pull
  request could widen what that session may run. Not verified: whether the pinned
  action loads the project's settings at all — the sweep did not read its source.
  `review-protocol.md` rule 6 says the workflow puts `.claude/` from the base branch;
  that is true of `.claude/agents` only. Only someone who can push a branch here can do
  this: the repository's write access is the boundary today.
- Proposal: first check what the pinned action loads. If it loads project settings,
  take `.claude/settings.json` and `.claude/hooks` from the base branch too, remove what
  the base does not have, and print `git status --short .claude` in the job log; then
  reword rule 6 to say what is really restored.
- Costs: a few lines of workflow, one more CI round to see it work. A pull request that
  changes a hook is then reviewed with the hook of `main`, as prompts already are.
- Decision (owner, 2026-10-11): accepted — check first what the pinned action loads, then fix; if it loads
  nothing of the project, the entry closes with what was read.
