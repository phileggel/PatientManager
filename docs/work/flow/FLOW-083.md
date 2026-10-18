# FLOW-083 — The design note of a proposal has no home in the doc map

- Kind: effort
- Size: S
- Observed: on 2026-10-17, `/design-proposal DEBT-062` Step 4 wrote its note at `screenshots/design/DEBT-062.md`; the commit hook refused it (`just rule-homes`: "not in any location of docs/README.md"). No design note had landed before. The five lines went on the entry's Design line instead.
- Proposal: the note lives where the decision does — `/design-proposal` writes it on the entry's Design line (a chat request: the PR body) and no longer as a file; or `docs/README.md` maps `screenshots/design/` as a location of transient notes.
- Costs: a step of one skill and its setup line, or one row of the doc map.
- Re-checked 2026-10-18 (audit of the v0.24.8 batch, `flow-auditor`): no design note written after #305. Left.
- Observed again 2026-10-18 (`/run-queue` Step 2): the notes of TODO-025, TODO-026 and TODO-008 refused by the same check; their content went on each entry's Design line, as DEBT-062's did.
