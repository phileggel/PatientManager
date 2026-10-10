# FLOW-036 — Nothing in a repository says what each piece of its agentic setup is for

- Kind: quality
- Observed: on 2026-10-10 this repository and the folioneer project hold 18 scripts, 8
  skills, 12 agent prompts and 5 git hooks under the same names; one hook is identical,
  every other file differs. Porting `/flow-audit` from folioneer took about an hour. Three
  layout changes of the same day (one file per entry, a queue written once per batch, the
  audit's repository figures) exist here only. The audit script found 17 documents naming
  a path that does not exist, some left by an earlier copy from another project. An
  earlier shared kit was dropped: too specialised, too far from the projects.
- The owner's direction (2026-10-10):
  - each project keeps its own setup, and no repository depends on another: one may be
    created, renamed or deleted at any time, so no command reads a second repository;
  - what must not drift is the responsibility of each generic piece, not its content;
  - comparing two repositories is the owner's request, in chat, from time to time.
- Proposal: a gold agentic document, `docs/agentic-setup.md`, complete on its own in each
  repository.
  1. A generic section: each generic skill, agent prompt, script, hook and document with
     its responsibility in one line, and what it must never do. It is written to read the
     same in every repository.
  2. A project section: the pieces only this project has (the reviewers of its stack, the
     skills of its domain), each with its line.
  3. One mechanical check, inside the repository: every script, skill, agent prompt and
     hook that exists is listed, and everything listed exists (`scripts/rule-homes.py`,
     the doc map).
  4. `/flow-audit` reads each generic piece against its line and reports any that no
     longer does what the document says.
  5. `CLAUDE.md` and `docs/README.md` point to the document instead of listing the tools
     themselves.
- Costs: one document of about a hundred lines, a check of about thirty lines with its
  tests, one step in `/flow-audit`. A responsibility is prose: only the audit's reading
  holds it. Protects: a tool whose role moves without anyone deciding it, and the hour of
  rediscovery each time two projects are compared.
- Decision (owner, 2026-10-10): accepted, first in the next queue — the document is to be reused in other
  repositories.
