# Specs — numbering, trigrams and format

A spec is `docs/spec/{feature}.md`, in English: the business rules of one feature, written
or amended by the agent from the issue and the code and checked by `spec-reviewer` before anything is
built from it (owner, 2026-10-18).

## Numbering

All business rules in feature specs use a consistent numbering scheme: **`TRIG-NNN`**

- **TRIG**: 3-letter code identifying the feature/context
- **NNN**: 3-digit index with gaps, grouped by topic: 010–019 eligibility & initiation, 020–029 creation, 030–039 updates & status changes, 040–049 deletion, 050–059 extensions
- **Letter suffix** (`TRIG-NNNA`, `TRIG-NNNB`, …): sub-rules of `TRIG-NNN`, used when a rule needs surgical sub-parts or a full block runs out of indices (ratified 2026-08-03; first use: BAS-113A/118A/120A–E)

Once assigned, a rule number never changes; a removed rule leaves its number vacant. A new trigram (three letters, unique) is registered below before its spec uses it.

---

## Trigramme Definitions

| Trigramme | Feature                     | Purpose                                                                               |
| --------- | --------------------------- | ------------------------------------------------------------------------------------- |
| **REF**   | Overpayment Management      | Manual refund recording and tracking for overpaid procedures                          |
| **FPA**   | Fund Payment Auto-Match     | Automatic matching of fund payments to procedures                                     |
| **BAS**   | Bank Statement Auto-Match   | Automatic reconciliation of bank statements with transfers                            |
| **BSM**   | Bank Statement Manual Match | Manual matching and exception handling for bank statements                            |
| **POC**   | Procedure Orchestration     | Cross-context procedure workflow coordination                                         |
| **PTY**   | Procedure Type Management   | Procedure type definitions and configurations                                         |
| **DBB**   | Database Backup & Import    | Database backup creation and restoration                                              |
| **EXI**   | Excel Import                | Bulk procedure import from Excel files                                                |
| **THM**   | Theme & Appearance          | UI theme management and styling                                                       |
| **UPD**   | Updater                     | Application version updates and releases                                              |
| **FPR**   | Fund Payment Report         | PDF report generated after fund-payment reconciliation                                |
| **IFC**   | Import Fixture Codec        | Dev-only inverse of import parsers — generates fixtures (Excel + fund-PDF + bank-PDF) |
| **DGR**   | Diagnostic Report           | Text report on the installation, with no patient data, the user sends to support      |
| **PDU**   | Patient Duplicates          | Listing same-name patients and merging or dismissing each pair                        |

---

## Reference Format

When referencing a rule in code, documentation, or tests, use the full code:

✅ **Correct**: "REF-010 ensures only eligible procedures can be refunded"
✅ **Correct**: `// Implements REF-012: validate refund date`
❌ **Avoid**: "R1 ensures eligibility" (ambiguous across specs)

---

## Reference Documents

Cross-spec conventions a spec author MUST honor when the relevant trigramme is in scope.

- [`reconciliation-ux-pattern.md`](../reconciliation-ux-pattern.md) — **applies to FPA · BAS · BSM.** The shared reconciliation **UX** convention: whole-document list (not bit-by-bit), per-line correction modal + batch action, live update, single validate. UX converges across the flows; code stays per-bounded-context (no shared component).

---

## Format

```markdown
# Business Rules — {Feature Title} ({TRIGRAM})

## Context

{2-4 sentences: the business need, the feature's role, the main entities.}

---

## Entity Definition

> Omit this section if the feature does not manipulate a persisted entity.

### {EntityName}

{One sentence describing what this entity represents in the business domain.}

| Field         | Business meaning                                                    |
| ------------- | ------------------------------------------------------------------- |
| `field_name`  | {What this field represents to the user, without technical detail.} |
| `other_field` | {Same.}                                                             |

> Names in English, Rust convention (`snake_case` fields, `PascalCase` entities); business
> meaning only — not the type, storage format or default value.

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

## Writing the rules

- Each rule atomic (one behaviour), testable on its own, with its scope: `(frontend)`,
  `(backend)` or `(frontend + backend)`. A notable edge case is a rule of its own.
- Every observable behaviour has a rule: one the Workflow or UX Draft shows without a rule
  gets one — form defaults, sort toggles, a modal staying open on error, empty state versus
  no search result. What the project's existing patterns settle (navigation, success
  feedback, network errors) is written as a rule without asking.
- An active ADR's choice is applied without asking; the owner is asked only when the
  feature must break one.
- Every assumption is an open question, asked before the work (`docs/workflow.md` § 3);
  a decision that passes the ADR gate (`docs/adr/README.md`) is an open question
  `ADR-SUGGESTED: {the decision and why}`, never mandated.
- **What and why, never how**: no SQL, file paths, function or component names, libraries
  or data structures. **Nor the contract's words**: no command names, error variant names
  (an error is a concept — "the action is rejected with a specific error"), return types,
  caller / request / DTO / payload framing, or runtime mechanisms ("background job",
  "frontend store", "thread", "worker"):

| ❌ Avoid                                                   | ✅ Prefer                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| "The command returns immediately to the caller"            | "The action is acknowledged synchronously"                               |
| "The backend rejects the request with `AccountNotFound`"   | "The action is rejected with a specific error if the account is unknown" |
| "Results are signaled via a background job posting events" | "Results are signaled asynchronously via the `{Entity}Updated` event"    |
| "The setting is stored in the frontend store"              | "The setting persists across sessions on the current device"             |

## Coverage

Before the spec is reviewed, grade each dimension it touches **Clear / Partial /
Missing**; a rule two competent developers could build two ways is at best Partial. Every
Partial or Missing cell is an open question, unless an existing pattern answers it;
business dimensions only — non-functional and data-format questions are the contract's.

| Dimension                 | Partial/Missing when…                                                          |
| ------------------------- | ------------------------------------------------------------------------------ |
| Entity fields             | a field's business meaning, optionality, or allowed values is unstated         |
| State transitions         | a lifecycle exists but some transitions, or who triggers them, are unspecified |
| Validation thresholds     | "valid"/"invalid" is used without the concrete boundary (min, max, format)     |
| Deletion semantics        | removal is mentioned but hard-vs-soft delete and cascade are unstated          |
| Inter-entity dependencies | a relationship's required/optional nature or cascade effect is unclear         |
| Edge cases                | empty, concurrent, conflicting, or duplicate-input behaviour is unspecified    |
| Permissions               | who may act is not pinned down when more than one role is plausible            |
