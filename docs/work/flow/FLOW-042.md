# FLOW-042 — The names of the skills do not say the flow

- Kind: quality
- Observed: on 2026-10-10 the owner asked which skill runs a whole queue, and on 2026-10-11
  whether `/whats-next` is the right name. "What's next" reads as "which task now", while
  the skill plans a whole batch; `/next-todo` shares the word "next" for a different job,
  and says "todo" though it also runs debt and flow entries. The script `whats-next.py`
  closes entries, gives the next id and lists what remains: more than its name.
- Proposal: one family on the two nouns the flow uses, queue and entry.
  - `/plan-queue` for `/whats-next`: decide what the batch holds.
  - `/run-queue`: unchanged.
  - `/run-entry` for `/next-todo`: run one entry of any kind.
  - `just queue` for `just whats-next`, with its `close`, `next-id` and `remaining`
    subcommands; the script and its tests follow.
  - The audit keeps `/flow-audit` unless the owner prefers a verb-first name.
    Read in order the names say the flow: plan the queue, run the queue (which runs each
    entry), release, audit. One pull request, no behaviour change.
- Costs: a wide mechanical change (two skills, one script and its tests, the recipe, the
  workflow document, the index, the headless runner). The folioneer project carries the
  old names until it is renamed too; the gold agentic document (FLOW-036) fixes them once.
- Decision (owner, 2026-10-11): accepted — "your naming propositions are clearly better".
