# Architecture Decision Records

An ADR keeps the _why_ of a **technical** choice costly to reverse — a framework, a storage
or transaction strategy, a test boundary. A functional or domain decision is never an ADR:
it is written in the spec or the glossary (owner, 2026-10-18). ADRs are rare.

**The gate** — all three hold, or no ADR: (1) genuinely complex, real trade-offs with no
obvious answer; (2) not obvious from the code or the spec; (3) costly to reverse,
significant rework across the codebase. The owner confirms before one is written.

**Writing one** — `docs/adr/{NNN}-{slug}.md`, the next number (never reused), one decision,
what was chosen and why, never how it is implemented; then its row below. An ADR is never
deleted: a new one supersedes it, and only the old one's `Status` line and index row
change; an ADR already superseded is not superseded again (the newer one is). The `Status`
is `Accepted`, `Accepted — supersedes ADR-{NNN}` or `Superseded by ADR-{NNN}`; a tentative
decision stays an open question in its spec.

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

## Index

| ADR                                                   | Title                                                                              | Status   |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- | -------- |
| [ADR-001](001-bank-fund-label-mapping-persistence.md) | Persistance des mappings label→fonds (BankFundLabelMapping)                        | Accepted |
| [ADR-002](002-overpayment-cascade-no-transaction.md)  | Accept Partial-State Risk in the Overpayment Cascade (No DB Transaction)           | Accepted |
| [ADR-003](003-unit-of-work.md)                        | Unit of Work for cross-aggregate atomicity                                         | Accepted |
| [ADR-004](004-e2e-rtl-test-boundary-combobox.md)      | E2E / RTL test boundary for HeadlessUI ComboboxField                               | Accepted |
| [ADR-005](005-combobox-feasibility-investigation.md)  | ComboboxField replacement feasibility investigation                                | Accepted |
| [ADR-006](006-frontend-resolves-pdf-translations.md)  | Frontend pre-resolves all translations and formatting for the backend PDF renderer | Accepted |
| [ADR-007](007-e2e-native-dialog-override.md)          | E2E native-dialog override pattern (`window.__e2e` + `e2eOverride()`)              | Accepted |
| [ADR-008](008-native-dialog-modal-system.md)          | Native `<dialog>` top layer for the modal system                                   | Accepted |
