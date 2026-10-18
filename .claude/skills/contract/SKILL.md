---
name: contract
description: Derives or updates a domain contract (docs/contracts/{domain}-contract.md) from a validated feature spec. Upsert-aware — adds commands without overwriting. Run after spec-reviewer approves, before contract-reviewer. Not for validating an existing contract — use `contract-reviewer` instead.
tools: Read, Glob, Write, Edit, AskUserQuestion
model: opus
---

# Skill — `contract`

The contract normalises the backend ↔ frontend interface of one bounded context — commands,
shared types, error variants — so both sides implement the same shape. It writes nothing
when it aborts: it reports `❌ Aborted — {reason}.`

## 1. Load the spec

The spec path given, or ask (listing `docs/spec/`). Read it in full.

## 2. Identify the domain

From the spec's `## Context`: the **bounded context (aggregate root)**, the
`context/{domain}/` service that owns the commands — never a use-case folder, a frontend
feature, a page or a UI concern. Commands from `use_cases/` belong to the contract of the
aggregate they mainly mutate; a gateway calling several contracts is expected. Not
inferable: ask which bounded context (`user`, `payment` — a `context/` folder).

## 3. Derive

**Commands** — one per **frontend-callable** backend operation, each backed by a spec rule:
an action triggered from the UI. Internal-only logic (background jobs, startup tasks,
schedulers, system monitors) has no caller and is no command. A rule unclear on who
triggers it ("reconciled on demand"): ask with **AskUserQuestion** — never classify a
borderline rule internal silently; an omission is harder to recover than an extra command.
For each: `command` (`snake_case`, the rule's operation), `args` and `return` (from the
Entity Definition), `errors` — every failure the rule describes, as named variants
(`NotFound`, `AlreadyExists`, `InvalidStatus`); a catch-all (`DbError`, `InternalError`,
`Unknown`) only beside them, never alone.

**Shared types** — each struct in args or returns: `snake_case` fields, `PascalCase` names,
business meaning only (no storage types, `Option<>` or derives).

**Events** — those state-transition rules imply.

No frontend-callable command (a frontend-only spec, or only internal backend rules):
`❌ Aborted — no frontend ↔ backend interface to normalize, no contract needed.`

## 4. No command in two contracts

Read every other `docs/contracts/*-contract.md`. A command name already in one: stop —
`Command {name} already exists in docs/contracts/{other}-contract.md. Each command belongs
to exactly one backend boundary.`

## 5. Write, after a yes

- **New**: compose the contract (format below), show it, ask "Does this look correct?",
  write it on approval. A no aborts.
- **Existing**: show the diff (new, modified — `get_user`: adding `NotFound` — and
  unchanged commands), ask, then patch — append the new commands, update the changed rows,
  never remove one silently.

Then append to `## Changelog`: `- {YYYY-MM-DD} — Added by {feature} spec: {commands}`.

## 6. Hand off

```
✅ Contract written — docs/contracts/{domain}-contract.md   (Updated, for a patch)
   Commands: {the new or modified ones}
   Next: run `contract-reviewer`, then implement.
```

## Contract format

```markdown
# Contract — {Domain}

> Domain: {domain}
> Last updated by: {spec-name}

## Commands

| Command           | Args                        | Return       | Errors                       |
| ----------------- | --------------------------- | ------------ | ---------------------------- |
| `snake_case_name` | `ArgStruct { field: Type }` | `ReturnType` | `ErrorVariant`, `OtherError` |

## Shared Types

\`\`\`rust
// Business-level struct — no derives, no Option, no storage detail
struct EntityName {
field_name: FieldType,
}
\`\`\`

## Events

| Event        | Payload       |
| ------------ | ------------- |
| `event_name` | `PayloadType` |

## Changelog

- {YYYY-MM-DD} — Added by `{spec-name}`: {command list}
```
