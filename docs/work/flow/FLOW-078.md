# FLOW-078 — A question to the owner goes through the question tool, not inside a message

- Kind: effort
- Size: S
- Observed: on 2026-10-14 and 2026-10-17, during the batch after 0.24.5, three questions put in chat waited on the owner unseen: one sat at the end of a status message ("your question wasnt obvious, next time ask directly with context"), and two were repeated across several status updates before an answer. `CLAUDE.md` § Who decides what says a question is asked alone, with its context; it does not name the means.
- Proposal: in chat, a question to the owner goes through the question tool (`AskUserQuestion`), one question per call, its options with what each changes and costs, the recommended one first; the status messages around it do not repeat it. `CLAUDE.md` § Who decides what and `docs/workflow.md` § 3 name it.
- Costs: a sentence in two guides at their ceiling, each with its cut. Protects: a decision waiting unseen.
- Decision (owner, 2026-10-17): "next time use askquestion tool".
- Re-checked 2026-10-17 (audit of the 0.24.7 batch, `flow-auditor`): decided 2026-10-17, not worked (`CLAUDE.md` unchanged). The session agent's answer adds the evidence: the three questions were `ensure_mutable` (2026-10-14), TODO-019's `edit` (10-14 → 10-17, about 60 h) and the zip advisories (10-17, about an hour); one term merged unconfirmed. Left; next to queue.
- Refined (2026-10-17): read `CLAUDE.md` § Who decides what and `docs/workflow.md` § 3 step 1, both "asked alone, with the context" and no means named. Done when: both name `AskUserQuestion`, one question per call, its options with what each changes and costs, the recommended first, and say the status messages around it do not repeat it; each addition with its cut; `just rule-homes` passes. Size S holds.
