---
name: whats-next
description: Shows the state of the work queue (queued, ready, blocked, debt, open pull requests) and proposes the next `## Next` queue for the owner to validate in chat. Chat only. Use when the queue is empty or short, after a release, or when returning to the project.
---

# Skill — `whats-next`

The owner sets the queue (`docs/workflow.md` § 2). This skill prepares that decision:
it shows where every entry stands and proposes an order. It never decides.

## Step 1 — Collect

`python3 scripts/whats-next.py` (`just whats-next`). It classifies and nothing more:
queued in order, ready but not queued, blocked with what each entry waits on, debt not
queued, open pull requests with their checks. "unknown" means GitHub could not be
asked — report it as unknown, never as none.

## Step 2 — Check the debt

Read `docs/techdebt.md`. For each entry not queued:

- **Obsolete** — "path gone", or the observation no longer holds (grep the code, read
  the git log): list it for removal. Removing it is a docs PR of its own, not part of
  the queue.
- **Owner's decision** — the entry says a choice is the owner's (a visible change, a
  product call): it cannot be queued before the answer. Put the question to the owner.
- **Workable** — the agent can do it as written.

Group entries that are one theme (same feature, same file, same cause) into one line.

## Step 3 — Draft what blocks an entry

An entry without a User value or a Done when cannot be queued. For each one the owner
may want next, draft both from the entry's own text: the User value in the user's
words (or "none directly — …" for internal work), the Done when as clauses a test can
prove. Never draft for an entry whose description is too thin to tell what done means;
say what is missing instead.

## Step 4 — Propose

Print, in this order:

1. **In flight** — open pull requests and their checks; the queue as it stands.
2. **Proposed queue** — references in order (written to `## Next` as a plain list,
   `- TODO-NNN`), todo and debt entries together, one reason per line: what it unblocks, what it depends on, what it should ship with.
   Dependencies first; an entry waiting on the owner is not in the queue.
3. **Needs you** — the decisions and the drafts from Steps 2 and 3, each as a question
   with a recommended answer.
4. **Left out** — one line per theme, with why (blocked, low value now, obsolete).

No value scores, no hour estimates, no "do now" verdict: the reason on each line is
the argument, and the owner weighs it.

## Step 5 — Write what the owner validates

Ask once: accept, or edit. The owner may also edit `docs/todo.md` by hand instead.
On a yes, write exactly what was validated, as a docs change through the harness
(branch `docs/queue-<date>`, PR, `just merge`):

- the `## Next` list, in the validated order;
- the User value and Done when of each accepted draft, and `**Open questions:** none`
  once nothing else is open.

## Rules

1. Chat only. A headless run never touches `## Next`.
2. Nothing is written before the owner's yes, and nothing beyond what the yes covers.
3. No entry is created, renumbered or deleted here; a new idea from the owner becomes
   an entry the owner dictates.
4. One proposal per invocation; `/next-todo` runs what was queued.
