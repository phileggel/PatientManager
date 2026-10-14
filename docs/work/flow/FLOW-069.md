# FLOW-069 — Planning a queue took four pull requests of records, and its entries were refined after the proposal

- Kind: effort
- Size: S
- Observed: on 2026-10-11 the queue of the batch after 0.24.4 was proposed twice: a first
  list of 13 lines the owner found too big, with entries nobody had read against their
  code, then 7 lines once each had been refined (one size moved from S to M, one order
  changed). Around it, the decisions and the filings went out as separate documentation
  pull requests — #263, #266, #268, #269 — beside the audit's own (#265). The audit of
  the 0.24.3 batch had already counted 12 record pull requests of 23 merged.
- Proposal (the owner's, 2026-10-11): refining is a step of `/plan-queue`, before the
  queue is proposed. For each candidate the skill reads the code the entry names,
  settles its open questions with the owner — never a design or a code question, which
  belong to the entry's own run — and evaluates its size from what it read. Once the
  owner has decided, the queue is banked and one pull request carries everything: the
  queue, the refinements, the answers, the entries filed on the way. Nothing is committed
  while the owner is still weighing the proposal.
- Costs: a longer planning step, done once; `/plan-queue` is at its ceiling, so its new
  step comes with a cut. Protects: a queue proposed before its entries are understood,
  and a history filled with commits that only record a hesitation.
- Decision (owner, 2026-10-11): "the queue refining should be part of the plan queue
  skill and should be in the same MR. open question can be tackled (no design or code
  question of course). size can be better evaluated as well. and when decided, we bank
  the queue and we create the mr about it" — "we need to avoid a bunch of doc commits
  that are just about the queue refinement or myself hesitating".
- Re-checked 2026-10-13 (audit of the 0.24.5 batch, `flow-auditor`): decided. Record pull requests after the queue: 3 (#276, #278, #279). #275's 11-hour stop is the cost of a question not asked at refinement, its observation now measured. #270 filed FLOW-069 on a work branch at the owner's request, while § 2 says the filing branch is `docs/file-<slug>`; when FLOW-069 ships, § 2 should say what the owner asked. Left.
- Refined (2026-10-14, before queuing): `.claude/skills/plan-queue/SKILL.md` is at its ceiling (97 of 97 lines), so the new step comes with a cut. Done when: `/plan-queue` has a refining step before Step 4 — for each candidate, read the code it names, settle its open questions with the owner (never a design or code question), check its size, and write a `Refined` line with its Done when; nothing is committed while the owner weighs the proposal; one pull request carries the queue, the refinements, the answers and any entry filed on the way; § 2 says a filing made at the owner's request on a work branch is allowed (#270). `just rule-homes` passes. Size S holds.
