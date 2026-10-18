# Contracts — format and rules

A contract (`docs/contracts/{domain}-contract.md`) is the wire record of one bounded
context's commands: what the frontend calls, with which arguments, what comes back and how
it fails, so both sides build the same shape. The agent writes or amends it from its spec,
and `contract-reviewer` checks it before anything is built from it (owner, 2026-10-18).

## Rules

- **One contract per bounded context** — the `context/{domain}/` aggregate root that owns
  the commands, never a use-case folder, a page or a UI concern. Commands from `use_cases/`
  belong to the contract of the aggregate they mainly mutate; a gateway calling several
  contracts is expected; one command in two contracts is not.
- **Frontend-callable commands only**, each backed by a spec rule: an action triggered from
  the UI. Internal logic (background jobs, startup tasks, schedulers) is no command; a spec
  with no frontend-callable backend rule has no contract. A rule unclear on who triggers it
  is asked, never classified internal silently.
- **Errors are exhaustive and named** — every failure a spec rule describes is a variant
  (`NotFound`, `InvalidStatus`); a catch-all (`DatabaseError`, `Unknown`) only beside them.
  The Errors column lists wire-visible codes, with the spec rule when it helps
  (`ProcessAlreadyRunning (ORD-113)`); Rust type names (`*Error` enums, composites) stay out
  (`docs/error-model.md` says how they are built).
- **Shared types** — business meaning only: `snake_case` fields, `PascalCase` names, no
  storage types, `Option<>` or derives. **Events** are those the spec's state transitions
  name; `Last updated by` names the spec the last change came from.
- **An amendment** appends new commands and updates changed rows; a command is never
  removed silently. Each change adds a Changelog line (the section added where missing).

## Format

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
