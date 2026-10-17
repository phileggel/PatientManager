# FLOW-078 — A question to the owner goes through the question tool, not inside a message

- Kind: effort
- Size: S
- Observed: on 2026-10-14 and 2026-10-17, during the batch after 0.24.5, three questions put in chat waited on the owner unseen: one sat at the end of a status message ("your question wasnt obvious, next time ask directly with context"), and two were repeated across several status updates before an answer. `CLAUDE.md` § Who decides what says a question is asked alone, with its context; it does not name the means.
- Proposal: in chat, a question to the owner goes through the question tool (`AskUserQuestion`), one question per call, its options with what each changes and costs, the recommended one first; the status messages around it do not repeat it. `CLAUDE.md` § Who decides what and `docs/workflow.md` § 3 name it.
- Costs: a sentence in two guides at their ceiling, each with its cut. Protects: a decision waiting unseen.
- Decision (owner, 2026-10-17): "next time use askquestion tool".
