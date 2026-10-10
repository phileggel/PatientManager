# FLOW-033 — Four statements the agent made without having read what they rest on

- Kind: quality
- Observed: (1) "Rust does not validate a procedure type on edit" — it did, in the
  command; only the service had been read; the commit was amended before its push.
  (2) "The cancelled runs will be replaced on their own" — nothing restarted them; two
  more watches. (3) A poll given a shortened commit id found no run and was reported as a
  failed check. (4) "Do the three checks before you run the release" (FLOW-031). Each was
  corrected and said to the owner within the hour; none reached `main`.
- Proposal: fold into `CLAUDE.md` § Talking to the owner: a statement that the code does
  not do something names what was read (command, service, aggregate); a statement about
  what a system will do next is either checked or given as a guess.
- Decision (owner, 2026-10-06): accepted. The two sentences go into `CLAUDE.md`
  § Talking to the owner.
- Costs: a sentence. Protects: the owner's trust in a status line, which is what an
  autonomous session runs on.
