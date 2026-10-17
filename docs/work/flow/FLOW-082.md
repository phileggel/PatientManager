# FLOW-082 — A term proposed during the work merges into code with its question in a status message and a pull request body only

- Kind: quality
- Size: S
- Observed: (`flow-auditor`, audit of the 0.24.7 batch) #286 `ensure_mutable`, 2 call sites, still `proposed` at v0.24.7. The session agent says the question sat at the end of a status message, and "what are you waiting for?" was read as a go-ahead.
- Proposal: a term still `proposed` at merge is an open question on an entry (a debt's Waits on the owner line). `just queue` lists the `proposed` glossary rows beside unnamed issues, so `/plan-queue` asks them. FLOW-078 covers how a question is asked; this covers where an unanswered one is kept.
- Costs: a few lines and a test in `work-queue.py`; one more list the owner reads at planning. Protects: a word in code that nobody validated.
- Decision (owner, 2026-10-17): accepted (banked).
- Re-checked 2026-10-18 (audit of the v0.24.8 batch, `flow-auditor`): no `proposed` term merged; `refund` and `edit` were confirmed before their code. Left.
