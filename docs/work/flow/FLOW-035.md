# FLOW-035 — The agent stopped its work nine times to ask what it could have asked before starting

- Kind: speed
- Observed: 15 questions went to the owner in the 0.24.1 batch.
  - 2 while the queue was built, 1 at the owner's request: where they belong.
  - 3 nothing could foresee: memory on the machine (twice), a finding of the release sweep.
  - 9 in the middle of an entry. Six of them were one entry, TODO-016, over two days: how
    the frozen list is defined, whether sorting moves, what a form shows for several
    errors, where amounts are read, the term `edit` — asked for the patient, then asked
    again for every other aggregate — and whether to stop. The others: the model for
    TODO-005, which the entry itself left open; a label DEBT-031 would change.
  - Each of the nine was answerable from the entry and the code it names, read before the
    first edit. Each stopped work in progress; the owner answered between other things.
- Decision (owner, 2026-10-06): "we need to do this prior to the work so that you don't
  interrupt yourself too much. However if needed and not anticipated you should continue
  to ask."
- How, for the entry that implements it:
  - `/next-todo` Step 0 gains a decision scan: before the branch exists, the agent reads
    the entry and the code it names, lists every choice that is the owner's (what a user
    sees, a term, a rule's scope, where a programme stops) and asks them then, one after
    the other, each with its context. The answers are written into the entry.
  - `/whats-next` Step 3 runs the same scan on what it proposes to queue, so an entry
    enters the queue with its questions answered; "ready" already means that.
  - A question is asked once at its widest: "the term for this aggregate" is asked as
    "the term for every aggregate edited from a form".
  - A choice with a standing answer is not asked: the answer is written where the rule
    lives. First two, from this batch: a finding of the release sweep that is not critical
    and predates the release is filed as debt and reported; when one option keeps what a
    user sees today, it is taken and stated in the pull request.
  - In the middle of an entry, a question remains right for what the scan could not show
    (a reviewer's finding, a failing machine, a behaviour found in the code). The audit
    after a release counts the questions and says which the scan should have caught.
- Costs: a reading pass before each entry, part of which the work repeats; a longer
  `/whats-next`. Protects: nine interruptions in a batch, and answers given with the whole
  entry in view instead of one corner of it.
