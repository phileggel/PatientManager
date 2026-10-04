# Documentation map

Each kind of document has one location, and each location holds only that kind. Other
documents link to the home and never restate it. `scripts/rule-homes.py` fails when a
Markdown file sits outside this map, when a path below no longer exists, or when a rule
ID is defined twice.

- **Domain** — `spec/` (`TRIGRAM-NNN`), `spec-index.md`, `ubiquitous-language.md`:
  business rules, their numbering, and what the domain words mean. The owner validates them.
- **Rules** — `backend-rules.md` (B), `frontend-rules.md` (F), `e2e-rules.md` (E),
  `i18n-rules.md`, `test-rules.md`, `commit-rules.md`, `visual-proof-rules.md`: how
  code, tests, strings, commits and visual proofs are written.
- **Rule examples** — `error-model.md`, `reconciliation-ux-pattern.md`: worked shapes for
  rules already stated in the rules docs.
- **Decisions** — `adr/`: technical choices costly to reverse, each with its guard.
- **Contracts** — `contracts/`: the wire record of each command.
- **Workflow** — `workflow.md`: how work moves from an entry to `main`.
- **Records** — `todo.md`, `techdebt.md`, `flow.md` (`FLOW-NNN`), `lessons.md` (`TL-NNN`),
  `../CHANGELOG.md`: what is owed to the user, to the code and to the workflow, and what
  was learned or shipped.
- **Reference** — `ddd-reference.md`: background an agent reads when a task needs it.
- **Map** — `../ARCHITECTURE.md`: where code lives.
- **Index** — `../CLAUDE.md`: authority, forbidden actions, and pointers to all of the
  above. `../.claude/rules/` loads the matching rules doc when a file of that layer is
  touched.
- **Agents** — `../.claude/agents/`, `../.claude/skills/`: reviewer and skill prompts.
  They apply the rules docs and link to them; they never restate a rule.
- **Onboarding** — `../README.md`, `../CONTRIBUTING.md`, `../.githooks/README.md`,
  `../.github/pull_request_template.md`: first steps for a human.

## When two documents disagree

The home wins: a spec over anything about business behaviour, a rules doc over anything
about how code is written, an ADR over the code it guards. The copy is removed, not
reconciled.

## Where a new statement goes

- A business behaviour → a spec rule (and the vocabulary if a new word appears).
- How to write code, tests, strings or commits → the matching `*-rules.md`, with an ID
  where it can be checked.
- A technical choice costly to reverse → an ADR with its guard; code organisation is
  never an ADR.
- Anything else an agent needs every turn → `CLAUDE.md`, as one line and a pointer.
