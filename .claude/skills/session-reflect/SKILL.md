---
name: session-reflect
description: End-of-session ceremony — audit recent work for rules earned / contradicted / surplus and propose add / trim / memory-only / nothing decisions for CLAUDE.md. Output-only; surfaces proposals for the user to confirm. Designed to be compact-resilient: signals come from persistent artifacts (git, memory files, CLAUDE.md diff), not just conversation context.
tools: Bash, Read, Grep
---

# Skill — `session-reflect`

A short end-of-session check: did anything emerge worth promoting, contradicting, or trimming?

Output-only. The skill proposes; the user confirms each edit. The skill never auto-writes to `CLAUDE.md` (memory entries follow the existing auto-memory write path).

---

## When to use

- **End of session** — user signals `good night`, `done for today`, `next task tomorrow`, `/exit`, or otherwise wraps the day.
- **After a notable stretch** — reviewer findings that produced new conventions, repeated user corrections, an emergent pattern across multiple PRs.
- **Periodic** — once a week if not naturally triggered, or whenever CLAUDE.md crosses its length budget (~250 lines).

**Skip** when the session was routine and no rule shifts are visible in the artifacts (Step 1). Just say "No CLAUDE.md changes — routine session." and stop.

---

## Required tools

`Bash`, `Read`, `Grep`.

---

## Compact-resilience

This skill is designed to survive an in-session `/compact`. After a compact, Claude loses verbatim user quotes and the texture of earlier reviewer findings, but persistent artifacts remain. **Signal priority order:**

1. `git log --since="1 day ago"` and `git log main..HEAD` — commits authored this session (never lost).
2. `ls -lt {memory_dir}/feedback_*.md` — memory entries added/updated (file mtimes reveal session activity).
3. `git diff main..HEAD CLAUDE.md` — rules already added/changed this session.
4. `docs/techdebt.md` entries dated today — tech-debt filed.
5. Conversation context (verbatim quotes, reviewer texture) — **supplement only**, not required.

If a candidate is only visible in conversation context (signal 5) and not in any persistent artifact, treat it as low-confidence — likely belongs in `no-add memory`, not `add`.

---

## Execution

### Step 1 — Gather artifact signals

Run in parallel:

```bash
wc -l CLAUDE.md
```

```bash
git log --oneline --since="1 day ago"
```

```bash
git diff --stat main..HEAD CLAUDE.md
```

```bash
ls -lt /home/phil/.claude/projects/-home-phil-project-PatientManager/memory/ 2>/dev/null | head -10
```

```bash
grep -n "^## $(date +%Y-%m-%d)" docs/techdebt.md 2>/dev/null
```

From the conversation (supplement only): user preferences expressed verbatim ("I will NEVER…", "from now on…", "always…", "stop doing…"), reviewer findings applied vs rejected, repeated decisions across multiple tasks.

### Step 2 — Bucket each candidate

For every signal, decide:

- **Add (→ CLAUDE.md)** — rule meets promotion criteria:
  1. Appeared in this session AND at least one prior session (`git log --grep="<keyword>"` for related commits), AND
  2. Project-wide generality (binds every future session, not just one feature's behavior).
- **No-add memory (→ `memory/feedback_*.md`)** — premature for CLAUDE.md: single-session preference, behavior-only, or not yet re-applied across sessions.
- **Trim (→ CLAUDE.md)** — existing rule was contradicted this session, redundant with another rule, replaced by a hook/lint/agent, or unexercised this session despite clear opportunities. Evidence required.
- **Nothing** — routine session, no rule shifts. Default outcome.

If CLAUDE.md is **above its 250-line budget**, additionally include a per-section line count (`grep -n '^## ' CLAUDE.md`) and flag the largest sections as trim candidates even without specific contradiction signals.

### Step 3 — Emit proposals

If everything is "Nothing":

> No CLAUDE.md changes — routine session.

Otherwise, output a single table:

| # | Bucket | Item | Evidence |
|---|---|---|---|
| 1 | Add | One-line rule statement | Commit / memory entry / reviewer finding from this session + reference to prior session |
| 2 | Trim | Existing rule to remove or rewrite | Contradiction or redundancy observed (cite specifically) |
| 3 | No-add memory | Rule going to memory only | Why it's premature for CLAUDE.md |

End with: `Confirm Add/Trim entries to apply.`

### Step 4 — Apply confirmed entries

The user accepts or rejects each row.

- **Add** → Edit CLAUDE.md (locate appropriate section; add as new bullet or sub-bullet). Use the established section structure; don't invent new top-level sections without flagging it.
- **Trim** → Edit CLAUDE.md (delete the rule, or consolidate with another).
- **No-add memory** → Use the auto-memory write path (`memory/feedback_*.md` + `MEMORY.md` index update). No additional user confirmation needed — same mechanism the auto-memory system uses every session.

---

## Critical rules

1. **Output-only by default** — propose, don't auto-edit CLAUDE.md. The user confirms each Add/Trim.
2. **Specific evidence required** — every proposal cites something concrete from this session (a commit, a memory entry, a reviewer finding, a verbatim user quote). No theoretical "we should add this".
3. **Brief output** — one line when nothing applies. Short table otherwise. No prose preamble.
4. **Honor promotion criteria** — Add proposals require evidence in ≥2 sessions AND project-wide generality. Single-session signals go to No-add memory.
5. **Compact-resilient signals only for Add** — if the only evidence is conversation context (no commit, no memory entry, no CLAUDE.md diff), downgrade Add proposals to No-add memory. A rule promoted to CLAUDE.md must be visible in persistent artifacts so a future audit can verify its origin.
6. **Length budget as proactive trim signal** — when CLAUDE.md exceeds 250 lines, surface a per-section line distribution and propose trim candidates even without contradiction evidence.

---

## Notes

This skill complements `/whats-next` (start-of-session: triage pending work). Together they bracket a day: pick task → execute → reflect.

The four memory categories (user / feedback / project / reference) are unchanged — `no-add memory` outputs typically land as `feedback` entries. The auto-memory system's normal write criteria apply.
