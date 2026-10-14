---
name: file-entry
description: Files one todo, debt or flow entry the right way — the command that creates it, the lines its kind requires, its size. Use whenever something must be recorded as an entry — a reviewer finding not fixed, a smell, a bug, a difficulty of the flow, a GitHub issue to work, a request the owner dictates.
---

# Skill — `file-entry`

The rules are `docs/workflow.md` § 2 (Filing an entry); this file is the checklist.

1. **Kind.** A todo is what a user would notice, a debt is about the application's code
   or documents, a flow entry is about how the work moves. A bug is a todo or a debt by
   the same test. A todo is drafted from the owner's words and says it is a draft.
2. **Create.** `just queue new <todo|debt|flow> "<title>"` — never a hand-written file —
   on a filing branch (`docs/workflow.md` § 2), the new entry's id never leading the slug.
   The title states the observation, not the fix.
3. **Fill every line** the command wrote. Evidence first: what was seen, where, with a
   figure or a pull request. One observation per entry; a second one is a second entry.
   A GitHub issue is named as `gh#NN`.
4. **Size** it by facts, with the definitions of § 2: S, M, L or XL.
5. **Say what waits on the owner**, and for what: the `Waits on the owner` line of a
   debt, the open questions of a todo; a flow entry waits until its `Decision` line.
6. **Check.** `just rule-homes` fails on an entry that lacks a line or a size.

A bug fixed in the same session is still filed first, in its own pull request; the fix
closes it. A chat request that is not a bug needs no entry.
