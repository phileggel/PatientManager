---
name: adr-manager
description: Manage Architecture Decision Records (ADR). Use this to create, update (supersede), or index architectural decisions in docs/adr/.
tools: Read, Glob, Write, AskUserQuestion
---

# Skill — `adr-manager`

Manages the lifecycle of the project's architectural decisions.
An ADR documents the "Why" behind a significant technical or business structural choice.

---

## Execution Steps

### 1. Identify Intent

The user or another agent (e.g., `spec-writer`) requests to:

- **Create** a new ADR.
- **Supersede** an existing ADR.
- **Initialize/Update** the ADR index.

### 2. Create a new ADR

If the intent is to document a new decision:

1. List `docs/adr/` to determine the next available number (e.g., `003`).
2. Draft the file `docs/adr/{NNN}-{title-slug}.md` using this structure:

```markdown
# ADR {NNN} — {Decision Title}

**Date**: {YYYY-MM-DD}
**Status**: Accepted / Proposed

## Context

{Description of the problem, challenge, or requirement necessitating a decision.}

## Decision

{The clear and concise choice made.}

## Consequences

- **Pros**: {Performance gains, code clarity, etc.}
- **Cons**: {Added boilerplate, technical limitations, etc.}
```
