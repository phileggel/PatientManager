# Workflow

How work moves in this repository, and the conventions the agents and skills rely on.

## Spec rule numbering (TRIGRAM-NNN)

Specs use **TRIGRAM-NNN** for business rules (e.g. `REF-010`, `PAY-020`):

- **TRIGRAM** — 3-letter identifier unique per feature domain, registered in `docs/spec-index.md`.
- **NNN** — 3-digit number, grouped by topic:
  - 010–019: eligibility & initiation
  - 020–029: creation
  - 030–039: updates & status changes
  - 040–049: deletion
  - 050–059: extensions & future

Once assigned, a rule number never changes. A removed rule leaves its number vacant.

## `[DECISION]` criticals

A reviewer critical tagged `[DECISION]` needs an architectural choice, not a mechanical fix. It is never fixed unilaterally: present the finding to the user first; the reviewer's guidance is a direction, not the answer. Once the choice is agreed, record it with `/adr-writer` → `adr-reviewer` in `docs/adr/` before applying the fix.

## Reviewer reports — `.review/`

The `reviewer-*` agents save their full output to `.review/{slug}-{date}-{NN}.md` via `bash scripts/review-path.sh {slug}`; `/review-triage` reads them to grade findings. `.review/` is gitignored and safe to delete — the next reviewer run recreates it.

## Authoring rule — no compound shell in agent / skill prompts

Bash blocks in `.claude/agents/*.md` and `.claude/skills/*/SKILL.md` must not use command substitution (`$(...)`), `&&`, `||`, `;`, or `cd X && cmd` chains.

Why: the permission allowlist matches a command by literal prefix, so a compound line can never be allowlisted and prompts on every run. Move the logic into a script under `scripts/` and call it by name (e.g. `bash scripts/branch.sh diff …`). For a multi-line payload, write it to a temp file first and pass the file (e.g. `gh pr create --body-file …`).

## Release sweep

Before a release, run the reviewer agents in `release-sweep` mode (the invoking prompt contains `release-sweep`) alongside `/dep-audit`.
