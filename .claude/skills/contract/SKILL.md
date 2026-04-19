---
name: contract
description:
  Derives or updates a domain contract (docs/contracts/{domain}-contract.md) from a validated
  feature spec. Upsert-aware — adds commands to an existing domain contract without overwriting.
  Run after spec-reviewer approves, before contract-reviewer and feature-planner.
tools: Read, Glob, Write, Edit, AskUserQuestion
---

# Skill — `contract`

Produce or update a domain contract from a validated feature spec.

---

## Execution Steps

### 1. Load spec

Ask for the spec path if not provided. Read `docs/spec/{feature}.md` in full.

If no spec path is given, list files in `docs/spec/` and ask the user which spec to use.

---

### 2. Identify domain

Extract the domain name from the spec's `## Context` section (the bounded context this feature
belongs to). If it cannot be inferred, ask the user: "Which domain does this feature belong to?
(e.g. `user`, `portfolio`, `payment`)"

---

### 3. Extract contract data from spec

From the spec, derive:

**Commands** — one per backend operation implied by a `backend` or `frontend + backend` scoped
rule. For each command identify:

- `command`: `snake_case` name matching the spec rule's operation
- `args`: struct name and fields from the Entity Definition section
- `return`: the entity or value the command returns (from Entity Definition)
- `errors`: every failure condition described in the spec rule

**Shared Types** — every entity struct involved in args or return values. Use Rust field naming
(`snake_case` fields, `PascalCase` struct names). Describe business meaning only — no storage
types, no `Option<>`, no derives. Those are implementation details for `feature-planner`.

**Events** — any named events implied by state-transition rules.

---

### 4. Check for existing contract

Run `Glob docs/contracts/{domain}-contract.md`.

**If the file does not exist:**

- Compose the full contract (see format below)
- Show it to the user and ask: "Does this contract look correct? Any changes before I create it?"
- On approval, write `docs/contracts/{domain}-contract.md`

**If the file already exists:**

- Read the current content
- Identify what is new (commands not yet present) and what would be modified (changed args/return/errors)
- Present the diff to the user:
  ```
  New commands:    create_user, update_user
  Modified:        get_user — adding NotFound error variant
  Unchanged:       delete_user
  ```
- Ask: "Does this look correct? Any changes before I update the contract?"
- On approval, patch the file — append new commands, update modified rows, never remove existing commands silently

---

### 5. Write changelog entry

After writing or patching, append to the `## Changelog` section:

```
- {YYYY-MM-DD} — Added by `{feature-name}` spec: {comma-separated list of new/modified commands}
```

---

### 6. Confirm and hand off

Report:

- Contract path: `docs/contracts/{domain}-contract.md`
- Commands written: list
- Next step: run `contract-reviewer` agent to validate the contract before proceeding to `feature-planner`

---

## Contract file format

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

---

## Critical Rules

1. Never silently overwrite existing commands — always diff and confirm with the user first
2. Frontend-only features (no `backend` scoped rules): create a minimal contract with an empty
   Commands table and a note "no backend commands — frontend-only feature" for traceability
3. Types use Rust naming conventions: `snake_case` fields, `PascalCase` structs
4. Errors must be exhaustive — every failure path described in a spec rule must appear as an
   error variant; generic `DbError`-only entries are a warning, not acceptable alone
5. Do not invent commands not backed by a spec rule — traceability is mandatory
6. If the `docs/contracts/` directory does not exist, create it before writing
7. This skill produces the contract shape — `contract-reviewer` validates correctness
