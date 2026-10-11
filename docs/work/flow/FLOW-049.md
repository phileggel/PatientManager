# FLOW-049 — The audit counts a branch that files or amends an entry as work on it

- Kind: quality
- Size: S
- Observed: on 2026-10-11, `just flow-audit v0.24.2` run on the batch in progress gave
  FLOW-048 three pull requests and FLOW-042 two. One pull request worked each (#247,
  #246); the others only edited the entry's text (#238 and #239 for FLOW-048, #240 for
  FLOW-042) on branches named `docs/flow-048-…`. `branch_entries` in
  `scripts/flow-audit.py` reads an entry id anywhere in a branch name, so both would be
  reported past their size. The rule of the same day — a bug is filed in a first pull
  request, fixed in a second — makes every bug carry such a branch. The figure arrived
  with #247; no audit has used it yet.
- Proposal: a branch that files or amends an entry is named `docs/file-<slug>`, without
  the id leading its slug, and the audit counts only a branch whose slug starts with the
  id (`<type>/flow-048-…`), as `CLAUDE.md` already names a task's branch. `/file-entry`
  and `docs/workflow.md` § 2 say so; a test with a filing branch.
- Costs: a few lines and a test; a naming rule for filing branches. A branch named the
  old way before the fix is still counted in the audit of this batch.
