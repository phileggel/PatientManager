# FLOW-045 — No stage of the flow says what it did when it ends

- Kind: quality
- Observed: on 2026-10-11 the owner stated what each stage owes when it ends, against
  what exists: `/run-queue` goes from its last entry to the release preparation without a
  word on what the batch achieved; `just release` ends on "published!" and does not show
  the changelog it wrote, and without a terminal it stops on a Python traceback at its
  confirmation prompt where "use `-y`" would do; `/flow-audit` gives pull requests and
  time per pull request but neither the entries filed and closed nor how long the queue
  took.
- The owner's expectations (2026-10-11):
  - the queue run creates the task list and asks every question it can in advance;
  - running an entry handles the whole entry, and may ask about the design when needed;
  - the queue run closes by stating what was achieved;
  - the release ends by stating the content of the changelog it wrote;
  - the audit states numbers — entries added and removed, how long the queue took, time
    per pull request — and evaluates and improves the flow.
- Proposal: `/run-queue` gains a closing brief (what shipped, what a user notices, what was
  filed, what was left); `scripts/release.py` prints the changelog section it wrote and
  answers a missing terminal with one line; `scripts/flow-audit.py` counts the entry files
  added and deleted in the window and the time from the first pull request opened to the
  last merged.
- Costs: a step in one skill, a few lines in two scripts with their tests. Protects: an
  owner who reads the end of each stage instead of asking for it.
- Decision (owner, 2026-10-11): accepted — these are the owner's own expectations.
