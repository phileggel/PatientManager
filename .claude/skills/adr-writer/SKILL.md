---
name: adr-writer
description: Authors and supersedes Architecture Decision Records (docs/adr/*.md). Run when a decision passes the 3-criteria gate (genuinely complex / not obvious from context / costly to reverse). After authoring or superseding, run `adr-reviewer` to validate quality before locking in. Not for tentative decisions — those stay in the spec's `## Open Questions` until ratified.
tools: Read, Glob, Write, AskUserQuestion
model: opus
---

# Skill — `adr-writer`

An ADR (`docs/adr/{NNN}-{slug}.md`, indexed in `docs/adr/README.md`) keeps the _why_ of a
structural choice the spec cannot carry. One decision per ADR; what was chosen and why,
never how it is implemented. `docs/adr/` holds the examples to follow.

## The 3-criteria gate

The canonical gate (`adr-reviewer` applies it). ADRs are rare: one is written only when
**all three** hold.

1. **Genuinely complex** — real trade-offs, no obvious right answer.
2. **Not obvious from context** — a reader of the code or the spec could not infer why.
3. **Costly to reverse** — undoing it means significant rework across the codebase.

## 1. Intent, gate, yes

- **Intent**: create, supersede, or refresh the index; ask with `AskUserQuestion` when unclear.
- **Gate**: confirm each criterion with the user, one yes/no each. One fails: write nothing
  and report `ℹ️ No ADR created — {criterion failed} ({one-line rationale}).` — callers
  parse this marker; silence is no refusal.
- **Yes**: show the proposed decision and wait for explicit approval, even when invoked by
  `/spec-writer` on an `ADR-SUGGESTED`. Never auto-create; a no writes nothing.

## 2. Create

The next number from `docs/adr/` (numbers are never reused). Ask for the title (short,
imperative — "Use i64 for monetary amounts") with `AskUserQuestion`, then for Context,
Decision and Consequences as one free-form answer. Write:

```markdown
# ADR {NNN} — {Decision Title}

**Date**: {YYYY-MM-DD}
**Status**: Accepted

## Context

{The problem, constraint or forcing function — why a decision is needed now.}

## Decision

{What was chosen and why over the alternatives, which are named.}

## Consequences

- **Pros**: {what becomes easier or possible.}
- **Cons**: {what becomes harder or constrained.}
```

## 3. Supersede

An ADR is never deleted: it is superseded. A target already `Superseded by ADR-{X}`:
refuse and point to ADR-{X}. Otherwise create the new ADR with `Status: Accepted —
supersedes ADR-{OLD}`, then change only the old one's `Status` line to `Superseded by
ADR-{NEW}`; its text stays readable as history.

The `Status` is one of `Accepted`, `Accepted — supersedes ADR-{NNN}`, `Superseded by
ADR-{NNN}` — nothing else; a tentative decision stays in the spec's Open Questions.

## 4. The index

After every create or supersede (both rows on a supersede), rewrite `docs/adr/README.md`
from each ADR's title and `Status`:

```markdown
# Architecture Decision Records

| ADR                          | Title   | Status                |
| ---------------------------- | ------- | --------------------- |
| [ADR-001](001-title-slug.md) | {Title} | Accepted              |
| [ADR-002](002-title-slug.md) | {Title} | Superseded by ADR-003 |
```

Report the paths written and the number given.
