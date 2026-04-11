---
name: spec-writer
description: Interactive spec writer for new features. Interviews the user to understand the feature (even if vague), reads the existing domain, then produces docs/spec/{feature}.md with structured TRIGRAMME-NNN business rules and an optional UX draft (textual or Stitch mockup).
tools: Read, Glob, Grep, Write, AskUserQuestion, mcp__stitch__generate_screen_from_text, mcp__stitch__list_screens, mcp__stitch__get_screen
---

# Skill — `spec-writer`

Produce a structured feature spec through guided discovery.
Works even if the feature is fuzzy — the interview phase exists precisely to clarify it.

---

## Execution Steps

### 1. Load domain context

Before asking anything, read:

- `ARCHITECTURE.md` — bounded contexts, data flow, naming conventions
  - If `ARCHITECTURE.md` does not exist, note it in the Open Questions section and proceed
- List all files in `docs/spec/` with Glob to understand what spec documents already exist
- Read the most recently modified spec in `docs/spec/` (excluding `todo.md`, `stitch/`, `*-rules.md`) to internalize the exact format and writing style
- Read docs/adr/ (if exists) to identify historical architectural decisions
  (e.g., amount storage format, soft-delete strategy, state management)
  that MUST be respected in the new TRIGRAMME-NNN rules.

This avoids asking the user what the codebase already answers.

---

### 2. Interview — Round 1

Use **AskUserQuestion** with up to 4 questions at once:

1. **Feature name** — what short name will be used for the file and rules?
2. **Trigram** — Assign a 3-letter identifier for this spec (e.g., `REF`, `PAY`, `INV`). Trigram must be unique per project. If your choice collides with an existing trigram in `docs/spec-index.md`, you'll be prompted to pick a different one (up to 2 collision attempts allowed; see Step 2.5).
3. **Business need** — in one sentence: who does what, and why?
4. **Domain** — which bounded context(s) are involved? (read ARCHITECTURE.md for the project's bounded contexts)

If the user's answers reveal new unknowns, continue with additional rounds — up to **3 rounds maximum** to avoid indefinite ping-pong. Each subsequent round is more targeted than the previous: max 3 questions in round 2, max 2 in round 3.

After round 3 (or earlier if all blocking uncertainties are resolved), draft the spec with what you have and move any remaining unknowns into `## Open Questions` for step 5.

- Only ask what you genuinely cannot infer from the codebase
- Never ask about file names, function names, or implementation choices (that's `feature-planner`'s job)
- For a simple feature, a single round is sufficient — never ask more than the feature's complexity warrants

---

### 2.5. Register trigram in spec-index.md

After Round 1, immediately:

1. **Read or create** `docs/spec-index.md` in the downstream project:
   - If it exists, read all current registrations
   - If it does NOT exist, create it with a template (see "Spec Registry" section at end of this skill)
2. **Register the trigram**: Add the assigned trigram, spec name, and description to the registry table
3. **Check for collisions**: If the trigram already exists:
   - Ask the user to choose a different trigram
   - Allow max 2 collision attempts; if collisions persist after 2 attempts, escalate: ask user to review the existing registration in spec-index.md and confirm they want to abandon this spec or use a different approach
4. **Persist the change**: Ensure `docs/spec-index.md` is updated and saved. **Important**: This file must be committed to version control — it is the single source of truth for trigram registrations across all project specs.

This step guarantees trigram uniqueness across all specs in the project.

---

### 3. Retro-engineering mode (exception only)

Only if the user explicitly asked to derive the spec from existing code (e.g., "retro-engineering", "document what already exists"):

- Grep for related entities in `src-tauri/src/context/`
- Grep for related frontend components in `src/features/`
- Check `src-tauri/src/core/specta_builder.rs` for existing commands in the domain
- Look for existing i18n keys in `src/i18n/locales/` for the domain (inspect whatever locale directories are present)

In all other cases, skip this step. The spec must express business intent, not describe current implementation.

---

### 4. Write the spec

Create `docs/spec/{feature-name}.md` using **exactly this structure** (English):

```markdown
# Business Rules — {Feature Title} ({TRIGRAM})

## Context

{2-4 sentences describing the business need, the role of this feature in the application,
and the main entities involved.}

---

## Entity Definition

> Omit this section if the feature does not manipulate a persisted entity.

### {EntityName}

{One sentence describing what this entity represents in the business domain.}

| Field         | Business meaning                                                    |
| ------------- | ------------------------------------------------------------------- |
| `field_name`  | {What this field represents to the user, without technical detail.} |
| `other_field` | {Same.}                                                             |

> Entity and field names in English, Rust convention (`snake_case` for fields,
> `PascalCase` for entities). No implementation detail: describe business meaning only,
> not the type, storage format, or default value.

---

## Business Rules

### Eligibility and Initiation (010–019)

**{TRIGRAM}-010 — {Short Title} (frontend + backend)**: {Precise, testable description of the rule.}

**{TRIGRAM}-011 — {Short Title} (backend)**: {Description.}

### Creation (020–029)

**{TRIGRAM}-020 — {Short Title} (frontend)**: {Description.}

### Status Updates (030–039)

**{TRIGRAM}-030 — {Short Title} (frontend + backend)**: {Description.}

---

> Rules cover: creation, validation, update, deletion, state transitions,
> inter-entity dependencies, edge cases.
>
> **Trigram Registry**: Trigram must be registered in `docs/spec-index.md` (see step 2.5).

---

## Workflow

{ASCII diagram of the main user flow, if relevant}

---

## UX Draft

### Entry Point

{How the user accesses the feature: drawer entry, FAB button, contextual action...}

### Main Component

{Type: modal / page / panel / dialog. Notable sub-components.}

### States

- **Empty**: {what the user sees with no data}
- **Loading**: {loading state}
- **Error**: {error messages, validation}
- **Success**: {success feedback}

### User Flow

1. {Step 1}
2. {Step 2}
3. ...

---

## Open Questions

- [ ] {Point to clarify before or during implementation}
```

**Rules for writing:**

- Each `{TRIGRAM}-NNN` rule must be atomic (one behavior per rule) and testable
- Scope `(frontend + backend)`, `(frontend)`, or `(backend)` is mandatory on every rule
- **Trigram declaration**: Header must include the trigram in parentheses (e.g., `# Business Rules — Feature Name (REF)`)
- **Thematic numbering**: Group rules by operation type (010–019 initiation, 020–029 creation, 030–039 updates, 040–049 deletion, 050+ future).- **Registry entry**: Trigram MUST be registered in `docs/spec-index.md` before writing the spec file (done in step 2.5).- Open Questions must list every assumption you made — do not silently decide
- If a rule has a notable edge case, add it as a separate rule (not a sub-clause)
- **What & why only** — never describe how something is implemented (no SQL, no component names, no library choices, no data structures); describe the observable behaviour and its business reason
- Entity and field names use English Rust conventions (`snake_case` fields, `PascalCase` entities); all surrounding prose in English

---

### 4.1 Architecture Decision (ADR) Detection

While drafting the `{TRIGRAM}-NNN` rules, if the feature requires a choice that:

- Differs from existing patterns in the codebase
- Impacts multiple contexts (e.g., a new complex UseCase)
- Requires a trade-off between two technical solutions
- Supersedes a previous ADR found in Step 1

**Action**: Add a mandatory item in `## Open Questions`:

- [ ] `ADR-REQUIRED`: {Briefly describe the architectural decision to be recorded}.

---

### 5. Resolve open questions (loop)

After writing the spec, check the `## Open Questions` section for unchecked items (`[ ]`).

**While `[ ]` items remain:**

1. Group remaining open questions into a single **AskUserQuestion** call (max 4 at a time, prioritise the most blocking ones first).
2. For each answer received:
   - If the answer resolves the question: update the affected `{TRIGRAM}-NNN` rule(s) in the spec, then mark the item `[x]` (or remove it if the answer makes the question moot).
   - If the answer reveals a new unknown: add a new `[ ]` item for it.
   - **If the user has no preference** ("doesn't matter", "up to you", "I don't know", or similar): do NOT decide silently. Instead:
     1. Reason from DDD/UX best practices and the patterns visible in `docs/` specs and ADRs (no code search).
     2. Propose 2–3 concrete options (each one sentence, no implementation detail), with a recommended default clearly marked. Present them via **AskUserQuestion** so the user explicitly picks one.
     3. Once a choice is made, apply it and close the question.
   - **If the user remains indecisive after options have been proposed** (still no preference on a second pass): apply the recommended default, close the question, and annotate the resulting rule with `<!-- AI-Decision -->` so the user can spot and revisit it later. Never loop more than twice on the same open question.
3. Rewrite the spec file with the updated rules and question list.
4. Loop back — ask again if `[ ]` items still remain.

**Exit condition:** all items in `## Open Questions` are either `[x]` or removed. The section must end with the line:

```
None — all questions have been resolved.
```

Only proceed to step 6 once this condition is met.

---

### 6. Coherence & completeness self-check

Before presenting to the user, run the following checklist mentally against the spec. For each failing point, fix the spec directly (add/split/reword rules) without asking the user — unless a fix would require a new business decision, in which case add a `[ ]` and loop back to step 5.

**Completeness — does the spec cover:**

- All applicable CRUD operations (create / read / update / delete) for each entity
- Validation rules for every field defined in the field table
- Loading state (frontend)
- Empty state (frontend, if applicable)
- All error states: validation errors, backend rejection errors, network/load errors
- Success feedback after mutating operations

**Coherence — are the rules internally consistent:**

- No two `{TRIGRAM}-NNN` rules contradict each other
- Every entity, field, or state referenced in a rule is defined somewhere (field table, context section, or ARCHITECTURE.md)
- Backend rules and frontend rules are aligned — a backend guard has a corresponding frontend error display, and vice versa
- Scope tags `(frontend)` / `(backend)` / `(frontend + backend)` are accurate — no rule tagged `(frontend)` describes server-side behaviour
- Terminology is consistent throughout (same term for the same concept in every rule)

After applying all fixes, rewrite the spec file once. Then proceed to step 7.

---

### 7. UX visual draft (optional)

Use **AskUserQuestion**:

> "Do you want to generate a visual mockup via Stitch?"

**If yes:**

1. Call `mcp__stitch__generate_screen_from_text` with:
   - `project_id`: `{STITCH_PROJECT_ID}`
   - `device`: `DESKTOP`
   - `model`: `GEMINI_3_1_PRO`
   - Prompt: derive from the `## UX Draft` section just written — describe the layout, key components, states
2. Call `mcp__stitch__list_screens` then `mcp__stitch__get_screen` to fetch the HTML
3. Use the **Write** tool to save the HTML to `docs/stitch/{feature-name}.stitch`
4. Add a `> Stitch mockup: docs/stitch/{feature-name}.stitch` reference in the `## UX Draft` section of the spec

**If no:** skip — the textual UX draft is sufficient to start.

---

### 8. Present and validate

Show the user:

- Path of the spec: `docs/spec/{feature-name}.md`
- Trigram assigned: `{TRIGRAM}`
- List of `{TRIGRAM}-NNN` rules extracted
- **Architectural Alert**: If an `ADR-REQUIRED` was flagged in Open Questions, explicitly tell the user:
  > "An architectural decision has been identified. It is recommended to run the `adr-manager` skill to document it before proceeding to `feature-planner`."

Then ask: **"Validate, refine, write the ADR, or generate the implementation plan?"**

- **Validate** → spec ready, done
- **Refine** → iterate on the specified section, rewrite, re-present
- **Plan** → tell the user to invoke the `feature-planner` agent with this spec path (Claude does not invoke it automatically from within this skill — the user triggers it as a separate step)

---

## Critical Rules

1. Read design docs BEFORE asking (`ARCHITECTURE.md`, `docs/`, ADRs) — never ask what the docs already answer. Do NOT read source code unless the user explicitly requested retro-engineering.
2. **Trigram is mandatory** — assign it in Round 1. Create or update `docs/spec-index.md` in step 2.5 to register it (prevents collisions).
3. Interview is capped at 3 rounds (Round 1: max 4 questions, Round 2: max 3, Round 3: max 2) — stop earlier if all blocking unknowns are resolved; remaining unknowns go into `## Open Questions` for step 5
4. Open Questions section is mandatory — never decide silently; if the user has no preference, search the codebase for similar patterns, propose 2–3 options with a recommended default, and let the user pick
5. **Never leave `[ ]` items unresolved** — step 5 loops until all opens are closed
6. **Run the coherence & completeness check (step 6) silently** — fix spec directly, only loop back to step 5 if a fix requires a new business decision
7. **What & why, never how** — the spec describes observable behaviour and business intent only; no SQL, no file paths, no function names, no component names, no library choices, no data structures; implementation is `feature-planner`'s job
8. **Entity section mandatory when an entity is involved** — names in English Rust convention, field descriptions in English, business meaning only
9. Each `{TRIGRAM}-NNN` rule must be independently verifiable by a test
10. Stitch uses project `{STITCH_PROJECT_ID}` exclusively — never create a new project
11. Write specs in English — all prose, section headers, and rule descriptions must be in English
12. Use the **Write** tool (not curl) to save `.stitch` HTML files- **Create in correct folder** — specs MUST be saved to `docs/spec/` folder (created automatically if missing)13. **Minimum friction** — do not ask about what the project's existing patterns already answer (navigation, success feedback, network error handling); generate a rule aligned with those patterns directly. Questions are reserved for genuinely new business decisions.
13. **No implicit behaviour** — every observable behaviour must be covered by an explicit `{TRIGRAM}-NNN` rule. If a behaviour is described in the workflow or UX section but has no corresponding rule, add the rule. Common implicit gaps: default values in forms, sort toggle behaviour, modal-stays-open-on-error, empty-state vs no-search-results distinction.
14. **Rule IDs are permanent** — once a rule number is assigned it never changes for the lifetime of the project. Tests reference rules by ID (e.g., `// REF-010 — ...`). If a rule is removed, leave the number vacant. New rules in the same theme increment by 1 (REF-010, REF-011, REF-012...). Never renumber existing rules.
15. **ADR Consistency** — If a choice is already documented in `docs/adr/` (e.g., storing amounts in i64), you MUST apply it in the TRIGRAMME-NNN rules without asking the user. You only ask if the new feature explicitly requires breaking a past ADR.

---

## Notes

The 3-round cap on the initial interview forces an early draft rather than endless clarification. For simple features one round is enough; the cap only kicks in for complex ones. Anything unresolved goes into `## Open Questions` as `[ ]` items. Step 5 then loops — interviewing the user until every `[ ]` is answered and the spec is fully closed. The spec must always end with "None — all questions have been resolved." before proceeding.

Specs are written in English. Code identifiers (function names, file paths) remain in English as per the codebase convention.

**Folder convention**: Specs always live in `docs/spec/` subfolder, not at `docs/` root.

**Stitch MCP setup**: Replace `{STITCH_PROJECT_ID}` in this file with your project's actual Stitch project ID before use. If the Stitch MCP is not configured in your environment, skip step 7 entirely — the textual UX draft is sufficient.

---

## Spec Registry (Mandatory per-project artifact)

Every downstream project **MUST** maintain a `docs/spec-index.md` file to track all active trigrams and prevent collisions. This is created automatically by spec-writer during the first spec creation:

```markdown
# Trigram Registry

| Trigram | Spec Name          | Description                    | Status   |
| ------- | ------------------ | ------------------------------ | -------- |
| REF     | Refund Management  | Recording overpayments/refunds | active   |
| PAY     | Payment Processing | Payments and reconciliation    | active   |
| INV     | Inventory Tracking | Stock levels and transfers     | planning |
```

This registry:

- **Created and maintained locally** — Lives in `docs/spec-index.md` in your project
- **Prevents trigram collisions** across all specs
- **Mandatory** — spec-writer creates it automatically if missing (see step 2.5)
- **Project-managed** — Updated when you write or archive specs
