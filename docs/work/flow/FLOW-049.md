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
- Decision (owner, 2026-10-11): accepted, for the next queue. The audit of this batch runs with the fault known.
- Added 2026-10-11 (audit of the 0.24.3 batch, `flow-auditor`): the entries figure is taken from the tag and the pull requests from the publication,
  so FLOW-042 to 044, filed by #233 and #234, fall in the wrong batch.
- Refined (2026-10-11, before queuing): ships with FLOW-057 and FLOW-053, one pull request on `scripts/flow-audit.py`. Done when: a branch whose slug does not start with the entry's id (`docs/file-…`) is not counted as work on it, with a test; the entry files and the pull requests are counted over the same window (today the first from the tags, the second from the publication times); `/file-entry` and `docs/workflow.md` § 2 name the filing branch, with a cut, both being at their ceiling. The three entries together are one M pull request: infra and guides lanes.
