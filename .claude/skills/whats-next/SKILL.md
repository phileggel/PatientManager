---
name: whats-next
description: Surveys pending work across TODOs, planning docs, unfinished feature plans, open spec questions, and in-flight git work, then returns a value/effort table with a recommended next action. Use at session start to triage what to work on, especially after a gap when context has faded.
tools: Bash, Read, Grep, Glob, Write
---

# Skill — `whats-next`

Triage pending work across the project and recommend the next concrete action.

This is the answer to "what should I do next?" when you're returning to a project after a gap and your in-context memory isn't loaded. It surveys multiple sources, verifies items aren't already shipped, and produces a value/effort-ranked shortlist.

---

## Required tools

`Bash`, `Read`, `Grep`, `Glob`, `Write`.

---

## When to use

- **Session start after a gap** — when you don't remember the project state
- **Before planning the day's work** — to see the full backlog at once instead of guessing
- **After finishing a task** — to pick the next one without context-switching cost
- **Before a release** — to check nothing pending should ship in the same window

Not needed when you already know what you're working on — use `/start` instead.

---

## Execution Steps

### Step 1 — Compute REPORT_PATH

Run `bash scripts/report-path.sh whats-next` and remember the output as `REPORT_PATH`.

### Step 2 — Survey the five sources

Run each scan independently. Skip sources whose files do not exist (no error).

**a) Top-level TODOs** — `docs/TODO.md` (or `docs/todo.md`). Read the full file; extract every section heading and bullet as a candidate item.

**b) Planning docs** — `docs/plan-*.md` at the docs/ root. Use `Glob("docs/plan-*.md")`; then `Read` each result to extract the title and any `## Open Questions` section.

**c) Unfinished feature plans** — `docs/plan/*-plan.md`. Use `Glob("docs/plan/*-plan.md")`; then `Read` each result to locate the `Workflow TaskList` (or equivalent checklist) and extract every `[ ]` item. A plan with all `[x]` is finished and not a candidate.

**d) Open spec questions** — `docs/spec/*.md`. Use `Glob("docs/spec/*.md")`; then for each file use `Grep` for `[ ]` to find unchecked items under `## Open Questions`.

**e) In-flight git work** — run each as a separate Bash call:

```bash
bash scripts/changed-files.sh
```

```bash
git branch --no-merged main 2>/dev/null | grep -v '^\*' | head -10
```

```bash
git log --oneline -10
```

Surface uncommitted changes and unmerged branches as candidates ("finish branch X" / "commit/discard pending changes in Y").

### Step 3 — Verify each candidate isn't already done

This step prevents stale TODOs from polluting the recommendation. For every candidate item, do a cheap existence/grep check:

- TODO mentions a file/script/skill name → `Glob` to check if it exists
- TODO mentions a feature keyword → `git log --oneline --grep "{keyword}"` to find shipping commits
- Plan task references a function/module → `Grep` for it

Mark items as `🟢 pending`, `⚠️ likely done` (evidence of shipping), or `❓ unclear` (ambiguous). Items marked `⚠️ likely done` should be reported as cleanup candidates, not work candidates.

### Step 4 — Score each pending item

For each `🟢 pending` item, assign:

- **Value** — High / Medium / Low. Considerations: frequency of use, blockers it removes, correctness/safety impact, dependencies on other items.
- **Effort** — rough hours (≤1h, 1–3h, 3–6h, >6h, unknown).
- **One-line recommendation** — `do now` / `do next` / `defer` / `drop` / `cleanup`.

**These estimates are model-judged.** Always include a disclaimer in the output that the user should sanity-check before acting on them — especially for items the model has no implementation context for.

### Step 5 — Pick the suggested next action

From all `🟢 pending` items, pick **one** as the suggested next action based on:

1. Highest value/effort ratio
2. No blocking dependencies
3. Self-contained (can be shipped without follow-up coordination)

If two items tie, prefer the one with explicit user signal (most recent edit, mentioned in recent commits).

### Step 6 — Output, save, confirm

1. Print the findings to the conversation using `## Output format` below.
2. **Save** the compact summary to `REPORT_PATH` using the Write tool — mandatory final action. The skill is incomplete until Write succeeds. Format defined in `## Save report` below.
3. Reply: `Report saved to {REPORT_PATH}`.

---

## Output format

```
## What's Next — {date}

> Value/effort estimates are model-judged. Sanity-check before acting,
> especially for items without recent context.

### Pending items

| # | Item | Source | Value | Effort | Recommend |
|---|------|--------|-------|--------|-----------|
| 1 | {short description} | docs/TODO.md:NN | High | 2h | do now |
| 2 | {short description} | docs/plan/foo-plan.md:NN | Medium | 1h | do next |
| 3 | {short description} | docs/spec/bar.md (Open Q) | Low | ≤1h | defer |

### Likely already done (cleanup candidates)
- {item} — evidence: commit {sha} / file {path} exists

### In-flight git work
- Uncommitted changes in: {N} files
- Unmerged branches: {list}

### Suggested next action
**#1 — {item title}**
Why: {1–2 sentences explaining the value/effort win and any dependency context}
First step: {concrete file or command to start with}
```

If nothing is pending:

```
## What's Next — {date}
✅ No pending items found across TODOs, plans, specs, or in-flight git work.
```

---

## Save report

The compact summary written to `REPORT_PATH` (Step 6) uses this format:

```
## whats-next — {date}-{N}

Pending items: N. Likely-done cleanup: N. In-flight: N.

### Suggested next
{item title} ({source}) — {value}/{effort}

### Pending shortlist
- #1 {item} — {source} — {value}/{effort} — {recommend}
- #2 ...

### Cleanup candidates
- {item} — {evidence}
```

Replace `{date}-{N}` with the values used in `REPORT_PATH`. Omit any section whose count is zero.

---

## Critical Rules

1. **Verify before recommending** — a TODO that mentions a file or feature must be cross-checked against the actual repo state before being scored. Stale TODOs surface as `cleanup candidates`, not work candidates.
2. **Estimates are model-judged, not authoritative** — the disclaimer at the top of the output is mandatory. Never present value/effort as decided priorities.
3. **One suggestion, not three** — pick a single next action. A list of "you could do any of these" defeats the purpose; the user invoked this skill to avoid that exact decision.
4. **Skip missing sources silently** — a project without `docs/spec/` or `docs/plan/` is a normal state, not an error. Report only on what was scanned.
5. **Save the report even when nothing is pending** — "no work" is itself a useful signal worth keeping for trend analysis.

---

## Notes

This skill complements `/start` (which selects a workflow when you already know the task). The natural session flow when returning to a project after a gap:

1. `/whats-next` → pick the task
2. `/start` → set up the workflow for that task
3. Execute, then `/smart-commit`
