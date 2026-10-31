# Workflow — what this project adds

The rules of how work moves are the method (`method.md` of the `flow` plugin: ownership,
issues, the Project, the backlog, budget and stop rules, the batch end, the audit) and the
loop (`loop.md` of the `app` plugin: one task to `main`, the design gate, reviewers, gold,
pull request size). `CLAUDE.md` § Commands says where they are. This document holds only
what is this project's; where it and they disagree on what they state, they are the rule.

## Issues and the Project

- **The Project** is github.com/users/phileggel/projects/4: `gh project item-add 4 --owner
phileggel --url <url>`. An old `TODO-NNN`, `DEBT-NNN` or `FLOW-NNN` is found by searching
  the issues for `Migrated from <id>`. A spec rule is `TRIGRAM-NNN`
  ([`spec/README.md`](spec/README.md)).
- **Its own labels**, beside a kind, never in its place (owner, 2026-10-18): `spec`, a spec,
  contract, glossary, ADR or `ARCHITECTURE.md` drifting from right code, a `task` queued on
  its own; `priority`, the owner wants it in the next batch, and it comes first in the
  order `/flow:plan-batch` proposes; `mock`, a Design needing a mock.
- **Expired tasks** (owner, 2026-10-24, ticket #492): a plain `task` (no `spec`, no security
  finding) not updated since the date of the third tag `just batch-ends 3` prints is closed
  with its reason when the batch ends.

## Design

Mocks live in `phileggel/PatientManager-design` (`design-proposal.repo` of
`.claude/daneel.json`).

## Ending a batch

`/app:run-batch` ends it. This project's batch-end check, whichever way it ends: the expired
tasks closed (§ Issues and the Project).

## The harness

`just harness` runs it locally without coverage, scoped to the layers the branch touched;
`--coverage` adds the floors of `coverage-gates.json`, before a first push. The script unit
tests never run in a hook (hooks export `GIT_DIR`). Beside the loop's checks:

- **Lint, format, types, build** — `scripts/check.py`, every PR.
- **Core without the desktop shell** — `scripts/core-without-tauri.sh`, when the backend
  changes: the crate builds with no Tauri dependency (B47).
- **Architecture rules A1–A8, B18, B24** — `scripts/arch-check.py`.
- **Doc map and rule homes** — `scripts/rule-homes.py`: every Markdown file in a
  location of `docs/README.md`, every rule ID defined once.
- **Guide ceilings** (owner, 2026-10-11) — the guides are `CLAUDE.md`, this document,
  `docs/agentic-setup.md`, the rules docs and `.claude/rules/`. The same script fails when one grows past
  the length `guide-ceilings.json` records for it. A ceiling is lowered as its guide
  shrinks (`just rule-homes --lower-ceilings`); raising one is the owner's yes, named in
  the pull request.
- **Coverage floors** — a gap is closed with tests on real branches; an honest lower figure
  on untested pass-through code is accepted.
- **Patient data** — `scripts/privacy-check.py`: no SSN or IBAN with valid check digits,
  no private value in a log call, no real data file; in the hooks, on the tree, and on
  the PR description (`pr-description.yml`).
- **Codec round-trip** — `codec-gate.yml`, when import codecs or fixtures change.

## The golds

- The backend layout (`backend-rules.md` B0, B37–B43), the frontend layout
  (`frontend-rules.md` F0, F26–F28; reference feature `bank-account`), the error model
  (`error-model.md`).
- Rule A8 freezes the logic files that remain in `src/features/`; the list only shrinks.
- **A moved or removed symbol**: feature-gated tests compile only in CI, so check them first
  (`SQLX_OFFLINE=true cargo check --tests --features dev-fixtures` in `src-tauri/`).

## Reviewers

- No lane runs for documents that are not guides. A green CI needs no local run (owner,
  2026-10-19).
- A "not a finding" rule, and a rule for what CI found and the local run missed, go in the
  lane's rules document (`review.rules` of `.claude/daneel.json`): the prompts `loop.md` § 5
  names are daneel's, pinned, not this repository's (phileggel/daneel#15).

## The usage log

A new script logs itself (`usage_log.start()` in Python, `. scripts/usage-log.sh` in shell;
a script that only CI runs does not); a recipe that runs no script depends on
`(_used "<recipe>")`.

## Shell calls

A command whose text names the installed application's identifier is refused by the deny
list, even a `grep`: search for it with the search tool, and read paths and log formats from
the source.

## Infra review

`app:reviewer-infra` adds these to its own checks (`.claude/daneel.json` names this document),
and the files `guide-ceilings.json` and `.claude/rules/*.md`:

- a ceiling in `guide-ceilings.json` raised without the owner's yes 🔴; the deny list losing a prohibition of `CLAUDE.md` § Core rules 1 🔴;
- `Bash(python3 -c *)` / `Bash(python3 - *)` are accepted, never widened; another spelling
  slipping past a deny rule is no finding, the list is a net under the rule (owner, 2026-10-11);
- `dtolnay/rust-toolchain@<channel>` may stay unpinned;
- a source scanner (`arch-check.py`, `privacy-check.py`, `rule-homes.py`) stripping
  comments differently across its rules 🟡; local and CI running different checks for one
  scope (`scoped-checks.sh`, `harness.sh`, `quality.yml`) 🟡, 🔴 when a hook skips one CI requires;
- a GNU-only flag or format in `scripts/` or `.githooks/` (`sed -i` with no suffix,
  `grep -P`, `date +%N`, `xargs -r`) 🟡 — a finding here, unlike the plugin's own lane (owner, 2026-10-26).
