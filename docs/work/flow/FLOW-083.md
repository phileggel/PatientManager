# FLOW-083 — The design note of a proposal has no home in the doc map

- Kind: effort
- Size: S
- Observed: on 2026-10-17, `/design-proposal DEBT-062` Step 4 wrote its note at `screenshots/design/DEBT-062.md`; the commit hook refused it (`just rule-homes`: "not in any location of docs/README.md"). No design note had landed before. The five lines went on the entry's Design line instead.
- Proposal: the note lives where the decision does — `/design-proposal` writes it on the entry's Design line (a chat request: the PR body) and no longer as a file; or `docs/README.md` maps `screenshots/design/` as a location of transient notes.
- Costs: a step of one skill and its setup line, or one row of the doc map.
