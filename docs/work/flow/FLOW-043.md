# FLOW-043 — The flow audit is written by the agent it audits

- Kind: quality
- Observed: `/flow-audit` is run by the agent that ran the batch, in the same session; its
  own text says the judging "needs that session's context". The figures are mechanical;
  their reading is the author's. On 2026-10-10 that author stated a diagnosis it had not
  read in the code (a negative-total group the parser could not produce), and closed an
  entry carrying spec rules without the spec check the workflow asks for — the release
  sweep's spec check found the real cause a hotfix later. Both are visible in the pull
  requests (#224, #231); a self-audit is the place where they would be softened.
- Proposal: an auditor of its own.
  1. A read-only agent with a fresh context, launched by `/flow-audit`. It is given the
     figures of `just flow-audit`, the pull requests of the batch with their review
     comments, and the entries filed during it — never the session agent's account.
  2. It judges and writes the findings; the session agent only answers its questions,
     and an answer is evidence, not a conclusion.
  3. What it cannot rebuild from the repository and the pull requests is itself a
     finding: something was decided or done without being written.
  4. Figures that live only in the conversation (the questions put to the owner) are
     logged as they happen, or leave the audit.
- Costs: one agent prompt to maintain; a longer audit; the loss of what was only said in
  chat. Protects: an audit that reads the batch as the reviewers read a branch.
- Decision (owner, 2026-10-11): accepted — independent is better.
