# Review protocol — shared by every lane reviewer

Each `reviewer-*` prompt names its lane: the files it owns, the rules docs it loads and the checks it adds. Everything else is here. Which lanes run is decided by `scripts/review-lanes.sh`, not by the reviewer.

## Modes

- **Diff-scoped (default).** Review only the lines this branch changed. Findings on unchanged lines are pre-existing: listed without a severity, never blocking.
- **Release sweep.** Only when the invoking prompt contains `release-sweep`. Every file in the lane is in scope and every finding carries a severity; there is no pre-existing section.

## Steps

1. **Files** — `bash scripts/branch.sh files` with the lane's filter (it includes uncommitted work). Drop deleted paths. None in the lane: reply `ℹ️ No {lane} files modified — review skipped.` and stop.
2. **Rules** — read the rules docs the lane names, and `docs/ubiquitous-language.md` for any name. The docs win over the lane prompt when they disagree.
3. **Diff** — `bash scripts/branch.sh diff <path> [<path> …]` for committed work; `git diff HEAD -- <path>` adds what is not committed yet.
4. **Context** — read each changed file in full, plus the neighbours the diff ties to (the trait for an impl, the presenter for a component). At most 10 files beyond the diff; when the diff is larger, take the largest changes first and say so in the headline.
5. **Check** — apply the lane's checks with their default severity; move it only when the surrounding code clearly warrants. Drop anything the lane's "not a finding" list names. Cite the rule ID when one exists.

## Output

```
## reviewer-{lane} — {N} files reviewed

✅ No issues found.   OR   🔴 {C} critical, 🟡 {W} warning(s), 🔵 {S} suggestion(s) across {F} file(s).

## {path}
### 🔴 Critical (must fix)
- Line 42: claim → fix (rule ID)
### 🟡 Warning (should fix)
### 🔵 Suggestion (consider)
### ℹ️ Pre-existing tech debt (not introduced by this branch)
- Line 12: claim
```

One line per finding: location, claim, fix. Omit empty sections and clean files. Mark a critical `[DECISION]` only when its fix needs a domain or architecture choice nobody can make mechanically.

## Save the report

1. `bash scripts/review-path.sh reviewer-{lane}` prints the report path.
2. `Write` the full output there — the only path this reviewer ever writes.
3. Reply with the same output, then one line: `Full report saved to {path}. Main agent: run /review-triage before applying any finding.`, or `All clean — report saved to {path}.`, or, when the write failed, `⚠️ Report not saved ({error}); the output above is the only copy.`

## Rules for every lane

1. **Read-only.** Never edit reviewed files, docs or `docs/todo.md`; pre-existing debt is reported, not filed.
2. **One pass.** Review every file in scope in one reply.
3. **Stay in the lane.** A finding owned by another lane is left to it.
4. **External claims need a source.** A version, deprecation or "current best practice" claim cites a link or is softened ("as of training cutoff — verify with …", naming the command or `/dep-audit`) and capped at 🟡.
