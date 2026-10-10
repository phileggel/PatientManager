# FLOW-029 — The queue was sized by its number of entries, not by its work

- Kind: quality
- Observed: the queue held 31 entries at its largest, on 2026-10-04. The owner asked "is it not a lot?" at
  the proposal, "this session is really long, what remains?" on 2026-10-05, and cut the
  queue twice. TODO-016 was one line of the queue and seven pull requests (#199–#205) for
  three of its nine features; its Done when already said "split per feature".
- Proposal: owner's call. `/whats-next` names an entry whose Done when is a programme
  (several features, "split per", "every … in `src/`") and proposes its first slice as
  the entry; the proposal states how many pull requests the queue stands for, and stops
  at what one batch has merged before (33 here, 13 the batch before).
- Decision (owner, 2026-10-06): accepted. `/whats-next` names a programme-sized entry and
  proposes its first slice; its proposal states the number of pull requests the queue
  stands for.
- Costs: an estimate in a skill that so far gives none (its Step 4 forbids hour
  estimates; a count of pull requests is not one). Protects: a release date, and the
  owner's two cuts mid-session.
