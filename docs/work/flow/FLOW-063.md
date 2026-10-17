# FLOW-063 — The generic part of the setup document names a pull request where it should name a ceremony (gh#248)

- Kind: quality
- Size: M
- Observed: issue gh#248, filed by the owner on 2026-10-11 while porting `docs/agentic-setup.md` to another project. Its Generic section says it reads the same in every repository, and four of its lines cannot: they say work lands through a pull request (`/run-entry` "to a merged pull request", `scripts/work-queue.py` "the open pull requests", `scripts/watch-pr.py`, `scripts/merge.py`). How a task lands is each repository's choice: here a pull request, elsewhere a local gate and commit.
- Proposal: the issue's own. Define the ceremony once in `docs/workflow.md` — what a task passes through to land on the main branch, and that here it is a pull request; reword the generic lines to name it; move the pieces that exist only because the ceremony is a pull request (`watch-pr.py`, `merge.py`) to "This project". Done when the Generic section names no pull request and `just rule-homes` still passes.
- Costs: one documentation pull request over two guides at their ceiling, read by the guides lane.
- Decision (owner, 2026-10-11): accepted (banked, FLOW-062: the proposal is the owner's own, written in the issue). Not queued before it is refined.
- Re-checked 2026-10-13 (audit of the 0.24.5 batch, `flow-auditor`): banked or decided, not refined. Left.
- Re-checked 2026-10-17 (audit of the 0.24.7 batch, `flow-auditor`): banked, not refined, left out of the queue a second time. Left.
- Refined (2026-10-17): read `docs/agentic-setup.md` § Generic, whose lines on `/run-entry`, `scripts/work-queue.py`, `scripts/watch-pr.py` and `scripts/merge.py` name a pull request. Done when: `docs/workflow.md` defines the ceremony once (what a task passes to land on `main`; here a pull request); the Generic section names no pull request; `watch-pr.py` and `merge.py` move to "This project"; `just rule-homes` passes. Ships with FLOW-064 and FLOW-065, one pull request on the same document. Size M holds.
