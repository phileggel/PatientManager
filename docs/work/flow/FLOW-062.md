# FLOW-062 — Every open decision was put to the owner, the trivial ones too

- Kind: effort
- Size: S
- Observed: on 2026-10-11, after the release preparation, the session listed eight open
  decisions in one message; the owner answered "always ask one question at a time with
  context" (already the rule of `CLAUDE.md`). It then asked seven in a row, and the owner
  took the recommended answer seven times. After the audit, with seven more proposals
  waiting, the owner said: "ask only if this is not trivial, otherwise bank them". Of
  those seven, two carried a real choice (FLOW-055, FLOW-061) and were asked; five were
  banked.
- Proposal: a proposal with one sensible answer — a fix with no cost a user or the owner
  would weigh, no money, no rule changed — is banked: recorded as accepted for the next
  queue, with "banked" on its Decision line, and reported in one line. A question is
  asked, alone and with its context, only where the options differ in cost, in risk or
  in what the owner sees. The owner can reverse a banked decision by editing its line.
  Home: `CLAUDE.md` § Who decides what and `docs/workflow.md` § 3, beside the standing
  answers; both guides are at their ceiling, so the lines come with a cut.
- Costs: a judgement of what is trivial, made by the agent; a banked decision the owner
  would have taken otherwise is found only when they read the record.
- Decision (owner, 2026-10-11): "ask only if this is not trivial, otherwise bank them".
- Refined (2026-10-11, before queuing): Done when: `CLAUDE.md` § Who decides what and `docs/workflow.md` § 3, beside the standing answers, say that a proposal with one sensible answer is banked — recorded as accepted with "banked" on its Decision line and reported in one line — and that a question is asked, alone and with its context, only where the options differ in cost, in risk or in what the owner sees. Ships in the guides bundle of FLOW-059.
