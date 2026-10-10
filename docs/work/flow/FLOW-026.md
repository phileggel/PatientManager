# FLOW-026 — A rebase conflict on a pushed branch has no way through

- Kind: speed
- Observed: on 2026-10-04, gh#185 and gh#186 each removed an entry from `docs/flow.md`,
  two neighbouring blocks. Once gh#186 merged, `just merge` on gh#185 stopped on the
  conflict, as designed. Resolving it by hand rewrites the pushed commit, and the push
  that follows is a force-push, which the rules forbid; `just merge` itself may
  force-push after its own rebase, but refuses a branch rebased by hand. The way out was
  a new branch and a replacement pull request (gh#187): one more CI round, one closed
  pull request.
- Proposal: `just merge` takes the resolution: on a conflict limited to record files
  (`docs/todo.md`, `docs/techdebt.md`, `docs/flow.md`), it re-applies the entry removals
  with the `close` mode instead of stopping; any other conflict still stops.
- Costs: about 30 lines and their tests. Protects: one CI round and a duplicate pull
  request each time two closures touch neighbouring entries, which a bundle makes likely.
