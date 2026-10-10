---
name: whats-next
description: Shows the state of the work queue (queued, ready, blocked, debt, open pull requests) and proposes the next queue (docs/work/queue.md) for the owner to validate in chat. Chat only. Use when the queue is empty or short, after a release, or when returning to the project.
---

# Skill — `whats-next`

The owner sets the queue (`docs/workflow.md` § 2). This skill prepares that decision:
it shows where every entry stands and proposes an order. It never decides.

## Step 1 — Collect

`python3 scripts/whats-next.py` (`just whats-next`). It classifies and nothing more:
queued in order, ready but not queued, blocked with what each entry waits on, debt not
queued, flow entries not queued (decided, waiting on the owner, or a watch), open
Dependabot pull requests not queued, open pull requests with their checks. "unknown" means GitHub could not be
asked — report it as unknown, never as none.

## Step 2 — Check the debt

Read the debt entries (`docs/work/debt/`). For each one not queued:

- **Obsolete** — "path gone", or the observation no longer holds (grep the code, read
  the git log): list it for removal. Removing it is a docs PR of its own, not part of
  the queue.
- **Owner's decision** — the entry says a choice is the owner's (a visible change, a
  product call): it cannot be queued before the answer. Put the question to the owner.
- **Workable** — the agent can do it as written.

Group entries that are one theme (same feature, same file, same cause) into one line.

Read the flow entries (`docs/work/flow/`) the same way: an entry with a `Decision` line is workable; one
without waits on the owner, and its question goes to them.

## Step 3 — Draft what blocks an entry

An entry without a User value or a Done when cannot be queued. For each one the owner
may want next, draft both from the entry's own text: the User value in the user's
words (or "none directly — …" for internal work), the Done when as clauses a test can
prove. Never draft for an entry whose description is too thin to tell what done means;
say what is missing instead.

## Step 4 — Propose

Print, in this order:

1. **In flight** — open pull requests and their checks; the queue as it stands.
2. **Proposed queue** — references in order (written to `docs/work/queue.md` as a plain
   list, `- TODO-NNN`), todo, debt, decided flow entries and every open Dependabot pull request
   (`- gh#NN`: its green reviewer checks are skips, `docs/workflow.md` § Conventions) together, one reason per line: what it unblocks, what it depends on, what it should ship with.
   Dependencies first; an entry waiting on the owner is not in the queue.
3. **Needs you** — the decisions and the drafts from Steps 2 and 3, one line each; they
   are asked one at a time in Step 5.
4. **Left out** — one line per theme, with why (blocked, low value now, obsolete).

No value scores, no hour estimates, no "do now" verdict: the reason on each line is
the argument, and the owner weighs it.

## Step 5 — Write what the owner validates

Ask for the queue first: accept, or edit. Then put each decision to the owner alone,
with its context, what each option changes and a recommended answer; the next one waits
for the answer. The owner may also edit `docs/work/queue.md` by hand instead.
On a yes, write exactly what was validated, as a docs change through the harness
(branch `docs/queue-<date>`, PR, `just merge`):

- `docs/work/queue.md`, replaced by the validated list in its order — the references
  of the batch before, all shipped or left out, go; `just whats-next` must then show no
  queued reference as "no such entry";
- the User value and Done when of each accepted draft, and `**Open questions:** none`
  once nothing else is open.

## Rules

1. Chat only. A headless run never touches the queue.
2. Nothing is written before the owner's yes, and nothing beyond what the yes covers.
3. No entry is created, renumbered or deleted here; a new idea from the owner becomes
   an entry the owner dictates.
4. One proposal per invocation; `/next-todo` runs what was queued.
