# FLOW-044 — Nothing reviews the documents and prompts the agent works from

- Kind: quality
- Observed: `reviewer-infra` reads the agent prompts, the skills, `.claude/rules/` and the
  settings, on a short list (compound shell, a path that does not exist, the deny and
  allow lists, a rule restated without one of its conditions). `CLAUDE.md`,
  `docs/workflow.md` and the rules documents are "docs only": no lane runs on them — PR
  #225 added three rules to the first two with no review. Nothing judges a prompt as a
  prompt. PR #220 took five CI rounds because the same kind of finding (a skill restating
  a rule) was raised one instance at a time. The 38 guides hold 4 155 lines, and nothing
  keeps one from growing.
- Proposal: a lane of its own, `reviewer-guides`, run when `CLAUDE.md`,
  `docs/workflow.md`, a `docs/*-rules.md`, a skill, an agent prompt or a `.claude/rules`
  file changes.
  1. A statement that contradicts the document that owns the rule.
  2. A rule restated where it should be named and pointed to.
  3. A name or a responsibility that differs from the gold agentic document (FLOW-036).
  4. Length: a skill or a prompt stays short. A mechanical ceiling per guide, recorded like
     the coverage floors and lowered as a guide shrinks, fails the check when a guide
     grows past it; raising a ceiling is the owner's decision. The reviewer says what
     could be cut, in every review.
     Dead paths stay mechanical (`just flow-audit`), out of the reviewer.
- Costs: one agent prompt, one lane in `review-lanes.sh` and `review.yml`, a small check
  with its tests; a few minutes on each pull request that touches a guide. Protects:
  guides that contradict each other or swell unnoticed, and CI rounds spent finding a
  prompt's faults one at a time.
- Decision (owner, 2026-10-11): accepted, with the survey of length: the text of a skill
  or an agent must not grow too much and stays short.
