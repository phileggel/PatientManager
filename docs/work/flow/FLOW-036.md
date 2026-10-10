# FLOW-036 — Two projects share a setup that nothing keeps in step, and nothing says which part is generic

- Kind: effort
- Observed: on 2026-10-10 this repository and the folioneer project hold 18 scripts, 8
  skills, 12 agent prompts and 5 git hooks under the same names; one hook is identical,
  every other file differs. Porting `/flow-audit` from folioneer took about an hour: the
  script and its tests needed two constants and the paths changed, the skill its paths and
  conventions. The three layout changes of the same day (one file per entry, a queue
  written once per batch, the audit's repository figures) exist here only. The audit
  script found 17 documents naming a path that does not exist, some of them left by an
  earlier copy from another project. An earlier shared kit was dropped: too specialised,
  too far from the projects.
- The owner's direction (2026-10-10): each project keeps its own setup for now; the flows
  are compared from time to time; a good idea of one project must not be forgotten in the
  other; the generic part should be told apart from the specific part, to see what could
  be shared one day.
- Proposal, in two steps, the second only if the first shows it is worth it:
  1. A mechanical comparison: `just flow-compare <other-project>` lists, for the scripts,
     skills, agent prompts and hooks, what exists on one side only, what is identical, and
     what differs with the date each side last changed. `/flow-audit` runs it and names
     what the other project improved since the last audit.
  2. The project's own facts leave the scripts for one file (the paths, the workflow that
     counts a CI round, the commit types, the entry folders): a script with no project
     fact in it is generic, and is then expected to be identical in both projects, so a
     difference is drift and nothing else.
- Costs: step 1, one script and its tests, about the size of `whats-next.py`'s `close`.
  Step 2 touches every script that carries a constant and must be done in both projects
  to mean anything. Protects: the hour of reconciling by hand at each comparison, and an
  improvement made in one project and never applied in the other.
