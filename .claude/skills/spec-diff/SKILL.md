---
name: spec-diff
description: Diffs two versions of a feature spec, identifies added/modified/removed TRIGRAM-NNN rules, and flags stale plan tasks and tests that reference rules that no longer exist or have changed. Use when revisiting a feature whose spec was edited at an unknown point in the past, or before re-running feature-planner / spec-checker on a feature that may have drifted.
tools: Bash, Read, Grep, Glob, Write
---

# Skill — `spec-diff`

Compare a feature spec against an earlier version and surface the downstream artifacts that have gone stale.

The default comparison is **current spec vs. spec at the commit that last touched the matching plan file** — i.e. "what has the spec gained, lost, or changed since the plan was last in sync with it?". This is the question you actually want answered when returning to a feature after a gap, when right-after-edit memory has faded.

---

## Required tools

`Bash`, `Read`, `Grep`, `Glob`, `Write`.

---

## When to use

- **Returning to a feature after a gap** — figure out whether plan + tests still match the spec
- **Before re-running `feature-planner`** — decide between a delta update or a full re-plan
- **Before `spec-checker`** — separate pre-existing gaps from new drift in the report
- **Before a release that touched specs** — confirm no stale plan tasks slipped through

Not a commit-time tool. At edit time you remember what you changed; this skill exists for the case where you don't.

---

## Execution Steps

### Step 1 — Compute REPORT_PATH

The saved compact summary IS the deliverable — compute its path before reading any spec:

```bash
mkdir -p tmp
DATE=$(date +%Y-%m-%d)
i=1
while [ -f "tmp/spec-diff-${DATE}-$(printf '%02d' $i).md" ]; do i=$((i+1)); done
echo "tmp/spec-diff-${DATE}-$(printf '%02d' $i).md"
```

Remember the printed path as `REPORT_PATH`.

### Step 2 — Locate the target spec

Argument resolution:

- If the user passed a path → use it directly.
- Else: `bash scripts/changed-files.sh | grep '^docs/spec/.*\.md$'`
  - 1 match → use it
  - 0 matches → ask the user which spec under `docs/spec/` to diff
  - > 1 matches → list and ask which one

### Step 3 — Determine the comparison ref

Argument resolution:

- If the user passed a ref (commit SHA, tag, branch) → use it.
- Else, derive the default from the matching plan file:
  ```bash
  PLAN_FILE=$(ls docs/plan/*-plan.md 2>/dev/null | grep -F "$(basename {SPEC_PATH} .md)" | head -1)
  REF=$(git log -1 --format=%H -- "$PLAN_FILE" 2>/dev/null)
  ```
- If no plan file matches OR the plan file has no git history → fall back to `HEAD` and note the fallback in the report header.

### Step 4 — Extract TRIGRAM-NNN rules from both versions

Read both versions:

```bash
# Old version (at REF)
git show "$REF:$SPEC_PATH"

# New version (working tree)
cat "$SPEC_PATH"
```

For each version, extract every rule. Rules in the spec follow the `spec-writer` format:

```
**TRIGRAM-NNN — Title (scope)**: Description.
```

For each rule, capture:

- `id` — e.g. `REF-010`
- `title` — short title between `—` and `(`
- `scope` — text inside `(...)` (e.g. `frontend`, `backend`, `frontend + backend`)
- `description` — text after the closing `**:` up to the next blank line or rule

If a rule line does not match the expected format, record it under `Malformed rules` in the report — do not silently skip.

### Step 5 — Compute the delta

Three sets:

- **Added** — `id` in new, not in old
- **Removed** — `id` in old, not in new
- **Modified** — `id` in both, but any of `title` / `scope` / `description` differs

For modified rules, capture the field-level diff (e.g. `scope: backend → frontend + backend`).

If all three sets are empty → the spec is unchanged at the rule level. Report `✅ No rule-level changes since {REF}.` and skip steps 6–7 (still write the report).

### Step 6 — Cross-reference against the plan file

If `PLAN_FILE` exists, read it and locate the `Rules Coverage` table (or any line referencing TRIGRAM-NNN ids).

For each Removed or Modified rule:

- Removed → flag every plan row referencing the id as `stale (rule removed)`
- Modified → flag every plan row referencing the id as `stale (rule changed: {field})`

For each Added rule:

- Flag as `missing from plan` if no plan row references the id

If no plan file exists, note `(no plan file found at docs/plan/{feature}-plan.md)` and skip this step.

### Step 7 — Cross-reference against tests and code

For each Removed or Modified rule, search the codebase for references to the id. Use the project's test conventions read from `ARCHITECTURE.md` if present; otherwise default to a broad search:

```bash
grep -rn "{TRIGRAM-NNN}" --include="*.rs" --include="*.ts" --include="*.tsx" \
    --exclude-dir=node_modules --exclude-dir=target --exclude-dir=.git \
    docs/plan/ src/ src-tauri/ tests/ 2>/dev/null
```

Report each hit as `stale reference (rule {removed|changed})` with `file:line`.

### Step 8 — Output, save, confirm

1. Print the findings to the conversation using `## Output format` below.
2. **Save** the compact summary to `REPORT_PATH` using the Write tool — mandatory final action. The skill is incomplete until Write succeeds. Format defined in `## Save report` below.
3. Reply: `Report saved to {REPORT_PATH}`.

---

## Output format

```
## Spec Diff — docs/spec/{feature}.md
Comparison ref: {REF}  ({tag/branch/SHA short — explain why this ref was chosen})
Plan file:      docs/plan/{feature}-plan.md  (or: not found)

### TRIGRAM Delta
Added (N):
  + REF-040 — Refund cap by user role (backend)
Modified (N):
  ~ REF-020 — Approval threshold
      scope:       backend → backend + frontend
      description: changed (see git diff for details)
Removed (N):
  - REF-030 — Manager double-sign (backend + frontend)

### Stale plan tasks (docs/plan/refund-plan.md)
  - REF-030 → "Implement manager-sign UI" (line 47) — rule removed
  - REF-020 → "Backend: enforce $500 threshold" (line 32) — rule changed (scope, description)

### Missing from plan
  - REF-040 — no Rules Coverage row references this id

### Stale references in code/tests
  - src-tauri/tests/refund_test.rs:42 — references REF-030 (rule removed)
  - src/features/refund/__tests__/threshold.test.ts:18 — references REF-020 (rule changed)

### Malformed rules (skipped from delta)
  (omit section if none)

### Summary
Added: N, Modified: N, Removed: N.
Stale plan tasks: N. Missing from plan: N. Stale code/test references: N.
Action required: regenerate plan tasks for added rules, remove or rewrite stale tasks/tests.
```

If no rule-level changes:

```
## Spec Diff — docs/spec/{feature}.md
Comparison ref: {REF}
✅ No rule-level changes since {REF}. Plan and tests are not impacted.
```

---

## Save report

The compact summary written to `REPORT_PATH` (Step 8) uses this format:

```
## spec-diff — {date}-{N}

Spec: docs/spec/{feature}.md
Compared against: {REF}
Plan file: docs/plan/{feature}-plan.md  (or: not found)

Added: N. Modified: N. Removed: N.
Stale plan tasks: N. Missing from plan: N. Stale code/test references: N.

### Stale items
- REF-030 → docs/plan/refund-plan.md:47 — rule removed
- REF-020 → docs/plan/refund-plan.md:32 — rule changed (scope, description)
- REF-030 → src-tauri/tests/refund_test.rs:42 — rule removed
- REF-040 → missing from plan
```

Replace `{date}-{N}` with the values used in `REPORT_PATH`. Omit the "Stale items" section if all counts are zero.

---

## Critical Rules

1. **Never compare against working tree alone** — comparison ref must be a git ref (default: last commit touching the plan file). Diffing the working tree against itself produces nothing.
2. **Modified ≠ reformatted** — a rule whose only change is whitespace or markdown emphasis is not "modified". Compare normalized text (trim, collapse whitespace) before classifying.
3. **Malformed rules are reported, not skipped** — silently dropping a rule that fails to parse hides drift; surface the line so the author can fix the spec format.
4. **No false negatives on stale references** — if the cross-reference grep fails (e.g. `tests/` does not exist), report the search scope explicitly so the user knows what was and wasn't checked.
5. **Save the report even when there are no changes** — the absence of drift is a meaningful audit signal worth keeping.

---

## Notes

This skill is a revisit-time tool. At edit time you remember what changed; this exists for the rest of the time. The default comparison ref (last commit touching the plan file) answers the most useful question: "what has the spec changed since the plan was last in sync with it?".

For release-driven workflows, pass an explicit ref: `/spec-diff docs/spec/refund.md v2.0`.
