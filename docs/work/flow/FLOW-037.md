# FLOW-037 — No skill runs a batch from its queue to its audit

- Kind: speed
- Observed: `/next-todo` runs one entry and stops; preparing a release is a paragraph of
  `docs/workflow.md` § 3; `/flow-audit` is invoked by hand after it. On 2026-10-10 the
  owner asked which skill handles the whole queue, asks for the release and runs the audit
  at the end: none does. A batch of 16 references is 13 invocations, or `/loop /next-todo`.
  The two bundles of the queue are notes in `docs/work/queue.md` that `just whats-next`
  does not print, so a fresh session can ship the first entry of a bundle alone. The
  folioneer project proposed the same skill on the same day (its FLOW-033, `/run-queue`).
- Proposal: a skill, `/run-queue`, that chains what exists and decides nothing new.
  1. It reads the queue with `just whats-next` and the notes of `docs/work/queue.md`
     (bundles, slices), and creates one task per remaining reference so the owner sees
     the queue advance.
  2. It invokes `/next-todo <ref>` for each ready reference in turn, a bundle as one
     task, and stops where `/next-todo` stops by its own rules.
  3. When nothing remains, it prepares the release (`/dep-audit`, the release sweep,
     `spec-checker` on the touched specs) and tells the owner it is ready; the owner
     runs `just release`.
  4. Once the draft is published, it runs `/flow-audit`.
     `just whats-next` also prints the notes of the queue file under the queue.
- Costs: one skill file and a line in `CLAUDE.md`; a few lines in `scripts/whats-next.py`
  for the notes, with a test. Protects: a batch whose steps are loaded, not remembered; a
  bundle shipped as the owner validated it; the release preparation and the audit not
  forgotten at the end of a long session.
- Decision (owner, 2026-10-10): accepted and queued. Until it ships, the agent follows these
  steps by hand: the queue, the release preparation, the audit.
