---
name: adr-manager
description: Manage Architecture Decision Records (ADR). Use this to create, update (supersede), or index architectural decisions in docs/adr/.
tools: Read, Grep, Glob, Write, AskUserQuestion
---

# Skill — `adr-manager`

Manages the lifecycle of the project's architectural decisions.
An ADR documents the "Why" behind a significant technical or business structural choice.

---

## When to write an ADR

ADRs are rare. Write one only when **all three** conditions hold:

1. **Genuinely complex** — the decision involves real trade-offs with no obvious right answer.
2. **Not obvious from context** — a future developer reading the code or the spec could not reasonably infer why this choice was made.
3. **Costly to reverse** — undoing the decision later would require significant rework across the codebase.

If the decision is a minor preference, a standard pattern, or self-evident from the spec, do not create an ADR.

**Always ask before writing.** If `adr-manager` is invoked from another agent or skill, confirm with the user that an ADR is truly warranted before proceeding — never create one automatically.

---

## Execution Steps

### 1. Identify Intent

The user or another agent (e.g., `spec-writer`) requests to:

- **Create** a new ADR.
- **Supersede** an existing ADR.
- **Initialize/Update** the ADR index.

Use **AskUserQuestion** if the intent is ambiguous.

---

### 2. Create a new ADR

If the intent is to document a new decision:

1. List `docs/adr/` to determine the next available number (e.g., `003`). If `docs/adr/` does not exist yet, treat the next number as `001`.
2. Use **AskUserQuestion** to collect:
   - Decision title (short, imperative: "Use i64 for monetary amounts")
   - Context: what problem or constraint led to this decision?
   - Decision: what was chosen and why?
   - Consequences: pros and cons
3. Write `docs/adr/{NNN}-{title-slug}.md` using this structure:

```markdown
# ADR {NNN} — {Decision Title}

**Date**: {YYYY-MM-DD}
**Status**: Accepted

## Context

{Description of the problem, challenge, or requirement necessitating a decision.}

## Decision

{The clear and concise choice made, and the reasoning behind it.}

## Consequences

- **Pros**: {Benefits of this decision.}
- **Cons**: {Trade-offs or limitations introduced.}
```

4. Update the ADR index (see step 4).

---

### 3. Supersede an existing ADR

If the intent is to replace a past decision with a new one:

1. List `docs/adr/` and identify the ADR to supersede. If `docs/adr/` does not exist or is empty, inform the user that there are no existing ADRs to supersede and offer to create a new one (step 2) instead.
2. Create the new ADR following step 2, with **Status**: `Accepted — supersedes ADR-{NNN}`.
3. Update the superseded ADR: change its **Status** line to `Superseded by ADR-{NEW}`.
4. Update the ADR index (see step 4).

```markdown
# ADR {OLD} — {Old Decision Title}

**Date**: {original date}
**Status**: Superseded by ADR-{NEW}
...
```

---

### 4. Initialize or update the ADR index

Maintain `docs/adr/README.md` as a navigable index of all ADRs:

1. List all `.md` files in `docs/adr/` (excluding `README.md`).
2. For each file, read the title and status.
3. Write `docs/adr/README.md`:

```markdown
# Architecture Decision Records

| ADR                          | Title   | Status                |
| ---------------------------- | ------- | --------------------- |
| [ADR-001](001-title-slug.md) | {Title} | Accepted              |
| [ADR-002](002-title-slug.md) | {Title} | Superseded by ADR-003 |
| [ADR-003](003-title-slug.md) | {Title} | Accepted              |
```

If `docs/adr/` does not exist yet, create it along with the empty `README.md`.

---

## Critical Rules

1. **ADR numbers are permanent** — once assigned, a number is never reused, even if the ADR is superseded or removed.
2. **Never delete ADRs** — supersede them instead. History must be preserved.
3. **Status is mandatory** — every ADR must have one of: `Accepted`, `Accepted — supersedes ADR-{NNN}`, `Superseded by ADR-{NNN}`. This skill only creates ratified decisions — tentative or unresolved decisions must stay in the spec's `## Open Questions` until a final choice is made.
4. **Always update the index** after creating or superseding an ADR.
5. **One decision per ADR** — if the user describes multiple decisions, split them into separate ADRs.
6. **Decisions only, no implementation** — the ADR describes what was decided and why, not how it is implemented in code.
