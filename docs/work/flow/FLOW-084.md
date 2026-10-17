# FLOW-084 — The review protocol does not list every base-branch file CI checks out

- Kind: quality
- Size: S
- Observed: `reviewer-infra` in CI on PR #309 (2026-10-17), as pre-existing debt. `.claude/agents/review-protocol.md` Rule 6 names `.claude/agents`, `.claude/settings.json` and `.claude/hooks` as the base branch's on disk in CI; `.github/workflows/review.yml` (the checkout step, line 179) also checks out `scripts/branch.sh`, `scripts/review-path.sh`, `scripts/usage-log.sh`, `scripts/usage_log.py` and, when present, `scripts/review-stop-reason.py` from the base branch. A lane that reads one of those scripts with `Read` instead of `branch.sh diff` reviews the base branch's copy, not the pull request's.
- Proposal: Rule 6 names every path the checkout step takes from the base branch, or points to that step as the list.
- Costs: one sentence in a shared prompt. Protects: a review of a script change that silently reads the old script.
