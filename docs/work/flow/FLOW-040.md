# FLOW-040 — A reviewer rule added in a pull request was applied to that pull request, five rounds

- Kind: speed
- Observed: PR #220 added a rule to the `reviewer-infra` prompt (a sentence that restates
  a rule without one of its conditions) after CI raised that finding. CI reviewers read
  the prompt of `main`, yet the next four rounds each raised a new instance of the same
  finding on the two skills the pull request had just written, citing the new rule. The
  root fix came at round four: the skills stopped restating the rule and pointed to it.
  Five CI rounds for a docs change of 60 lines.
- Proposal: when a finding is about a restated rule, the first fix is to stop restating —
  one line in `docs/workflow.md` § 7 beside "a CI finding the local run missed". And the
  local lane is re-run on a prompt the same pull request changed, before the push.
- Costs: a sentence; one more local review on such a pull request. Protects: four CI
  rounds, and prompts that copy rules instead of naming them.
