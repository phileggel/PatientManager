---
name: kit-discover
description: Cross-references CLAUDE.md against kit-tools.md and kit-version.md to surface drift (CLAUDE.md describes a workflow the kit now replaces), gaps (kit ships an item CLAUDE.md does not reference), and redundancies (CLAUDE.md duplicates content owned by kit-tools.md). Proposes a CLAUDE.md patch in the conversation — never modifies the file. Use after a kit sync, especially when the version delta is non-trivial, or when CLAUDE.md feels out of sync with what the kit ships.
tools: Bash, Read, Grep, Glob
---

# Skill — `kit-discover`

Reconcile `CLAUDE.md` with what the kit actually ships, and propose the edits.

The downstream `CLAUDE.md` is user-owned — sync never touches it. Over time, it can drift away from the kit: a workflow described there gets replaced by a new skill, a new agent ships without a mention, or a section duplicates the inventory in `kit-tools.md`. This skill diffs the three artifacts and proposes a patch the user reviews and applies manually.

---

## Required tools

`Bash`, `Read`, `Grep`, `Glob`.

---

## When to use

- **After a kit sync** with a non-trivial version delta — verify CLAUDE.md still reflects the kit's surface area
- **When CLAUDE.md feels stale** — workflow descriptions don't match how you actually work today
- **Before a release** that changes how the project consumes the kit — catch outdated guidance before it ships
- **Onboarding a new project to the kit** — spot what CLAUDE.md should reference but doesn't

Not a continuous-integration tool. CLAUDE.md drift moves slowly; running this once per kit sync is enough.

---

## Execution Steps

### Step 1 — Verify the discovery files are present

Required reads:

- `.claude/kit-tools.md` — canonical inventory of what the kit ships
- `.claude/kit-version.md` — current kit version + delta since previous sync
- `CLAUDE.md` — the file under review

If `.claude/kit-tools.md` is missing → reply: ``Run `just sync-kit` first — kit-discover needs the discovery files written by sync.`` and stop. Do not attempt to operate without it.

If `CLAUDE.md` is missing → reply: `No CLAUDE.md to reconcile — the project has not yet adopted one. Skipping.` and stop.

### Step 2 — Inventory what the kit ships

Parse `.claude/kit-tools.md`. Extract from its tables:

- **Agents** — `## Generic Agents` and `## <Profile> Profile Agents` sections; collect every backticked name in the first column
- **Skills** — `## Skills (slash commands)` section; collect both the skill name and its slash command
- **Scripts** — `## Generic Scripts` and `## Scripts (<profile>)` sections; collect script names and their commands
- **Git hooks** — `## Git Hooks` section; collect hook names
- **Justfile recipes** — `### Generic recipes` and `### <Profile> profile recipes` subsections; collect recipe names and `just …` commands

Hold the result as a flat catalog of identifiers (names + commands) tagged by category.

### Step 3 — Inventory what the project actually contains

Verify the catalog against the filesystem — `kit-tools.md` describes what _should_ be present, but a partial sync may leave gaps:

```bash
ls .claude/agents/ 2>/dev/null
ls .claude/skills/ 2>/dev/null
ls scripts/ 2>/dev/null
ls .githooks/ 2>/dev/null
```

For justfile recipes, list recipe names from the local justfiles:

```bash
just --list 2>/dev/null
```

If the above returns no output (i.e. `just` is not installed or no justfile is present), fall back:

```bash
grep -hE '^[a-zA-Z_][a-zA-Z0-9_-]*:' justfile common.just *.just 2>/dev/null
```

Flag any catalog item not actually present on disk as `missing — kit-tools.md lists it but it isn't synced`. This is a sync problem, not a CLAUDE.md problem — surface it separately and continue.

### Step 4 — Cross-reference against CLAUDE.md

Read `CLAUDE.md` once. For each catalog item, classify into one of:

- **Mentioned** — name or command appears in CLAUDE.md, no contradicting workflow nearby
- **Gap** — kit ships a _user-facing_ item (skill, recipe, script command) that CLAUDE.md does not reference. Agents are not gaps by default — they auto-discover by file presence; only flag an agent if CLAUDE.md describes a workflow that _should_ invoke it but doesn't (e.g. "before commit, run X manually" when an agent already does X automatically)
- **Drift** — CLAUDE.md describes a manual workflow that a kit-shipped skill/recipe/script now automates, OR references a path/command that has been renamed or replaced. Examples: CLAUDE.md says "run `cargo test`" but `just check-full` exists; CLAUDE.md says "run `python3 scripts/release.py`" but `just release` is the documented kit recipe
- **Redundancy** — CLAUDE.md contains a list, table, or paragraph that re-documents content already in `kit-tools.md` (e.g. an inline table of agents, a duplicated recipe list)

For each finding, capture the CLAUDE.md line number and the catalog item it relates to.

### Step 5 — Propose a patch

Output a **proposed CLAUDE.md patch** in the conversation using the format in `## Output format` below. The patch is advisory only — do not edit `CLAUDE.md`. Tell the user to review and apply manually.

If no findings → reply with the empty-patch confirmation under `## Output format`.

---

## Output format

```
## Kit Discovery — CLAUDE.md vs kit-tools.md

Kit version: <from .claude/kit-version.md>
Scanned: .claude/kit-tools.md, CLAUDE.md, scripts/, .githooks/, justfiles

### Sync gaps (catalog item missing on disk)
- <item> — listed in kit-tools.md but not present at <expected path>
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
Drift: N. Gaps: N. Redundancies: N. Sync gaps: N.

> Review the patch above. CLAUDE.md is user-owned — apply edits manually.
> This skill never modifies the file.
```

If nothing to reconcile:

```
## Kit Discovery — CLAUDE.md vs kit-tools.md
Kit version: <…>
✅ CLAUDE.md is in sync with the kit. No drift, gaps, or redundancies found.
```

---

## Critical Rules

1. **Never modify CLAUDE.md** — output is advisory only. The user reviews and applies edits by hand.
2. **Stop early if discovery files are missing** — without `.claude/kit-tools.md`, the skill has no source of truth. Tell the user to run `just sync-kit` and exit.
3. **Don't flag agents as gaps by default** — agents auto-discover by presence in `.claude/agents/`. Only flag an agent when CLAUDE.md actively describes a workflow that should call it but doesn't.
4. **Separate sync gaps from CLAUDE.md gaps** — if `kit-tools.md` lists an item that isn't on disk, that's a sync problem (re-run `just sync-kit`), not a documentation problem. Surface it in its own section.
5. **Quote, don't paraphrase** — when reporting drift, include the exact CLAUDE.md snippet and a concrete suggested replacement. Vague advice ("update this section") forces the user to redo the analysis.
6. **Empty patch is a real result** — when nothing is wrong, say so. Don't manufacture findings.

---

## Notes

The catalog in `kit-tools.md` is the kit's self-description; `kit-version.md` provides the temporal context (what changed since the project's previous sync). Read both before forming any judgment about CLAUDE.md drift — a section that looks stale may simply have been updated by the most recent kit version.

This skill complements `/whats-next` (which surveys _project_ backlog). Both are revisit-time tools for catching what edit-time memory has forgotten.
