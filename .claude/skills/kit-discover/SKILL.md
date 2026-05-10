---
name: kit-discover
description: After a kit sync, verifies every entry in `.claude/kit-manifest.txt` is on disk and reconciles `CLAUDE.md` against `.claude/kit-tools.md` — surfacing sync gaps, drift, gaps, and redundancies. Proposes a CLAUDE.md patch the user reviews and applies manually.
tools: Bash, Read, Grep, Glob
---

# Skill — `kit-discover`

Reconcile `CLAUDE.md` with what the kit actually ships, and confirm the last sync landed cleanly. The downstream `CLAUDE.md` is user-owned (sync never touches it); over time it drifts. This skill diffs the relevant artifacts and proposes a patch the user reviews and applies manually.

---

## Required tools

`Bash`, `Read`, `Grep`, `Glob`.

---

## When to use

- **After a kit sync** with a non-trivial version delta — verify CLAUDE.md still reflects the kit's surface area and that every manifest entry landed
- **When CLAUDE.md feels stale** — workflow descriptions don't match how you actually work today
- **Before a release** that changes how the project consumes the kit — catch outdated guidance before it ships

---

## When NOT to use

- **As a CI check** — CLAUDE.md drift moves slowly; running once per sync is enough
- **For CLAUDE.md authoring or editing** — this skill is read-only on CLAUDE.md; if you need to write a fresh CLAUDE.md, use Claude Code's built-in `/init`
- **Before the first sync** — without `.claude/kit-tools.md` and `.claude/kit-manifest.txt` the skill has no source of truth; run `just sync-kit` first

---

## Execution Steps

### Step 1 — Verify the discovery files are present

Required reads:

- `.claude/kit-tools.md` — canonical inventory of what the kit ships
- `.claude/kit-version.md` — current kit version + delta since previous sync
- `.claude/kit-manifest.txt` — sorted list of every kit-owned file written by the last sync
- `CLAUDE.md` — the file under review

If `.claude/kit-tools.md` or `.claude/kit-manifest.txt` is missing → reply: ``Run `just sync-kit` first — kit-discover needs the discovery files written by sync.`` and stop.

If `CLAUDE.md` is missing → reply: `No CLAUDE.md to reconcile — the project has not yet adopted one. Skipping.` and stop.

### Step 2 — Build the CLAUDE.md cross-reference catalog

Parse `.claude/kit-tools.md` to build the catalog of identifiers Step 4 will look for in CLAUDE.md. Extract from these tables:

- **Agents** — `## Spec & Planning Agents` and `## Code Review & Test Agents`; collect every backticked name in the first column
- **Skills** — `## Skills (slash commands)`; collect both the skill name and its slash command
- **Scripts** — `## Scripts` (sub-sections: Shared helpers, Quality & release); collect script names and their commands
- **Git hooks** — `## Git Hooks`; collect hook names
- **Justfile recipes** — ``## Justfile Recipes (`common.just`)``; collect recipe names and `just …` commands

Hold the result as a flat catalog of identifiers tagged by category. This catalog is **only used in Step 4**; sync-gap detection in Step 3 uses the manifest, not this catalog.

### Step 3 — Verify the sync is complete

Run the post-sync validator — it reads `.claude/kit-manifest.txt` and reports any kit-owned file that did not land:

```bash
bash scripts/validate-sync.sh
```

Exit codes:

- `0` → all manifest entries present; no sync gaps to report
- `1` → **expected when the sync regressed**; capture each `✗` line as a `Sync gaps` finding for Step 5 and **continue to Step 4**
- `2` → manifest itself missing (the project's last sync predates the manifest feature); reply: ``Run `just sync-kit` to refresh the manifest, then re-run /kit-discover.`` and stop

### Step 4 — Cross-reference against CLAUDE.md

Read `CLAUDE.md` once. For each catalog item from Step 2, run a substring check:

```bash
grep -F "{identifier}" CLAUDE.md
```

Classify each item into one of:

- **Mentioned** — name or command appears in CLAUDE.md, no contradicting workflow nearby
- **Gap** — kit ships a _user-facing_ item (skill, recipe, script command) that CLAUDE.md does not reference. Agents are not gaps by default — they auto-discover by file presence; only flag an agent if CLAUDE.md describes a workflow that _should_ invoke it but doesn't (e.g. "before commit, run X manually" when an agent already does X automatically)
- **Drift** — CLAUDE.md describes a manual workflow that a kit-shipped skill/recipe/script now automates, OR references a path/command that has been renamed or replaced. **A command-mismatch beats a name-match**: if CLAUDE.md says `python3 scripts/release.py` and `kit-tools.md` documents `just release`, classify as Drift, not Mentioned
- **Redundancy** — CLAUDE.md contains a list, table, or paragraph that re-documents content already in `kit-tools.md` (e.g. an inline table of agents, a duplicated recipe list)

For each finding, capture the CLAUDE.md line number and the catalog item it relates to.

### Step 5 — Propose a patch

Output a **proposed CLAUDE.md patch** in the conversation using the format in `## Output format` below. The patch is advisory only — do not edit `CLAUDE.md`. Tell the user to review and apply manually.

If no findings → reply with the empty-patch confirmation under `## Output format`.

---

## Output format

```
## Kit Discovery

Kit version: <from .claude/kit-version.md>
Scanned: .claude/kit-tools.md, .claude/kit-manifest.txt, CLAUDE.md

### Sync gaps (manifest entry missing on disk)
- <path> — recorded in .claude/kit-manifest.txt but not present in the project
(omit section if none — these are sync issues, not CLAUDE.md issues)

### Drift — CLAUDE.md describes outdated workflow
- CLAUDE.md:<line>
  Current: "<quoted snippet>"
  Suggested: "<rewrite that uses the kit-shipped equivalent>"
  Reason: <kit-tools.md row that supersedes it>

### Gaps — kit-shipped item CLAUDE.md does not reference
- /<skill-or-recipe> — <one-line purpose from kit-tools.md>
  Suggested location: <CLAUDE.md section/heading where it fits>

### Redundancies — CLAUDE.md duplicates kit-tools.md content
- CLAUDE.md:<line-range>
  Duplicates: <kit-tools.md section>
  Suggested: replace with `> See .claude/kit-tools.md for <topic>.`

### Summary
Sync gaps: N. Drift: N. Gaps: N. Redundancies: N.

> Review the patch above. CLAUDE.md is user-owned — apply edits manually.
> This skill never modifies the file.
```

If nothing to reconcile:

```
## Kit Discovery

Kit version: <from .claude/kit-version.md>
Scanned: .claude/kit-tools.md, .claude/kit-manifest.txt, CLAUDE.md

✅ Sync valid and CLAUDE.md is in sync with the kit. No gaps, drift, or redundancies found.
```

---

## Critical Rules

1. **Never modify CLAUDE.md** — output is advisory only. The user reviews and applies edits by hand.
2. **Stop early if discovery files are missing** — without `.claude/kit-tools.md` or `.claude/kit-manifest.txt`, the skill has no source of truth. Tell the user to run `just sync-kit` and exit.
3. **Don't flag agents as gaps by default** — agents auto-discover by presence in `.claude/agents/`. Only flag an agent when CLAUDE.md actively describes a workflow that should call it but doesn't.
4. **Separate sync gaps from CLAUDE.md gaps** — if the manifest lists a path that isn't on disk, that's a sync problem (re-run `just sync-kit`), not a documentation problem. Surface it in its own section.
5. **Quote, don't paraphrase** — when reporting drift, include the exact CLAUDE.md snippet and a concrete suggested replacement. Vague advice ("update this section") forces the user to redo the analysis.
6. **Empty patch is a real result** — when nothing is wrong, say so. Don't manufacture findings.
7. **Built-in slash commands are out of scope** — only emit findings tied to catalog items from `kit-tools.md`. Do not commentate on Claude Code built-in slash commands (`/init`, `/review`, `/security-review`, `/help`, `/config`, `/clear`) when they appear in CLAUDE.md, even when a name overlaps a kit-shipped item (`/security-review` ≠ kit's `reviewer-security` agent).

---

## Notes

`kit-tools.md` is the kit's self-description; `kit-version.md` provides the temporal context (what changed since the project's previous sync); `kit-manifest.txt` is the authoritative record of what the last sync wrote. The three serve different roles — Step 2 uses the catalog (kit-tools), Step 3 uses the manifest, Step 4 uses CLAUDE.md against the catalog. Conflating them produces miscategorised findings, which is why the v4.3 refactor split them.

A CLAUDE.md section that looks stale may simply post-date a kit-tools.md update — read the version delta in `kit-version.md` before forming any drift judgment.

This skill complements `/whats-next` (which surveys _project_ backlog). Both are revisit-time tools for catching what edit-time memory has forgotten.
