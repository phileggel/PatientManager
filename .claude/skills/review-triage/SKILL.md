---
name: review-triage
description: Grades every reviewer-* finding (a)/(b)/(c) under `docs/workflow.md` § 7 before any is applied. Reads the fresh `.review/` reports, emits one row per finding with a mechanical follow-up, and saves the table for the PR body. Applied after every reviewer batch; never halts for the user. Routes (b) rows to `/techdebt`.
---

# Skill — `review-triage`

The policy is `docs/workflow.md` § 7; this skill applies it row by row. It only produces the table — the main agent carries out each follow-up.

## Steps

1. **Reports.** `bash scripts/report-path.sh review-triage` gives `REPORT_PATH`. `bash scripts/list-fresh-reviews.sh` lists the reports newer than `HEAD`. None → the clean output, stop.
2. **Findings.** Read each report and take every 🔴, 🟡 and 🔵. Items under `ℹ️ Pre-existing tech debt` are not graded; the main agent files the ones worth tracking with `/techdebt`. No findings → the clean output, stop.
3. **Grade.** Answer in order; the answers are the grade:
   - **Q1 — introduced by this branch?** Check with `bash scripts/branch.sh diff <file>`. Yes → tentatively (a), go to Q3. No → Q2.
   - **Q2 — pre-existing but boyscout-eligible?** In a file the PR already touches, about 10 lines of fix at most, mechanical. All three → (a); otherwise (b).
   - **Q3 — needs design judgement, or fans out beyond the PR's files?** Yes → (b). Mechanical fan-out inside the PR stays (a).
   - **Q4 — empirically wrong, out of scope, YAGNI, or style with no rule behind it?** Yes → (c), overriding (a) or (b). Recurring across files, or binding future runs → (c) pattern; otherwise (c) one-off, the default when unsure.
   - A `[DECISION]` critical is graded but never fixed unilaterally: it becomes an open question on the entry.
4. **Table.** One row per finding (identical findings may share a row with `Affects:`), each with the question that settled it.
5. **Save** the table to `REPORT_PATH` and reply `Triage report saved to {REPORT_PATH}. Main agent: apply each row's Follow-up.`

## Follow-ups

- **(a)** — fix it in the PR; the commit is the record.
- **(b)** — `/techdebt where=<path> obs="<one line>" found-by=<reviewer> severity=<emoji>`, linked from the PR body.
- **(c) one-off** — inline comment at the line: `// <reviewer> FP: <reason> — see PR #NN`.
- **(c) pattern** — a "Not a finding" entry in that reviewer's prompt, same PR.

## Output

```
## /review-triage — {N} findings from {M} reviewers

Sources: {paths under .review/}

| # | Source | File:Line | Finding | Grade | Why | Follow-up |
|---|--------|-----------|---------|-------|-----|-----------|
| 1 | reviewer-backend | src/foo.rs:42 | 🔴 unwrap() in prod path | (a) | Q1: introduced, mechanical | Fix in the PR |
| 2 | reviewer-arch | src/foo.rs:1 | 🔴 cross-context import | (b) | Q2: pre-existing, 8 files | /techdebt where=src/foo.rs:1 obs="…" found-by=reviewer-arch severity=🔴 |
| 3 | reviewer-frontend | src/qux.tsx:30 | 🟡 i18n key fallback | (c) one-off | Q4: branch unreachable | // reviewer-frontend FP: unreachable fallback — see PR #NN |
```

Clean batch: `## /review-triage — clean` and one line saying no report or no finding. The table (or the clean line) goes into the PR body.

## Rules

1. Every finding gets an explicit grade and the question that settled it; no batch-accept.
2. "Pre-existing" alone never decides a grade — Q2 does.
3. Each follow-up is executable as written: the exact file and line, the exact `/techdebt` arguments, the exact comment text.
