# The agentic setup

What each piece of the setup is for, in one line, and what it must never do. The
content of a piece differs from one repository to another; its responsibility does not.
Only what this repository holds: what the plugins bring is in their own files.

`scripts/rule-homes.py` fails when a script or a git hook
exists without a line here, or when a line names a path that is gone. `/flow:flow-audit`
reads each generic piece against its line. A piece is a list item opened by its path.

## Generic — written to read the same in every repository

### Documents

- `CLAUDE.md` — the index the agent reads every turn: authority, forbidden actions,
  pointers. Never: states a rule that has a home elsewhere.
- `docs/README.md` — the map: one location per kind of document. Never: holds a rule.
- `docs/workflow.md` — how work moves from an issue to the main branch, and who decides
  what. Never: says how code is written.
- `docs/commit-rules.md` — the commit format and what each type means. Never: restated
  in a hook's message beyond the line that failed.
- `docs/ubiquitous-language.md` — what the domain words mean, validated by the owner.
  Never: extended by the agent without a question.
- `ARCHITECTURE.md` — where code lives. Never: why a choice was made (an ADR does).
- `.claude/rules/` — loads the rules document of a layer, or a document folder's
  `README.md`, when one of its files is read. Never: states the rule itself.
- `.claude/settings.json` — what the agent may run without asking, and what it may
  never run. Never: allows what `CLAUDE.md` forbids.
- `justfile` — the one entry point to every command. Never: holds logic a script
  should own and test.
- `coverage-gates.json` — the coverage floors. Never: lowered.
- `arch-allowlist.json` — the frozen architecture debt. Never: raised.
- `guide-ceilings.json` — the length each guide may not exceed. Never: raised without
  the owner's decision.

### Plugins

- The pinned `flow@daneel` and `app@daneel`: every skill, reviewer prompt and flow script
  comes from them (`CLAUDE.md` § Commands says where), with what each must never do in its
  own file; `.claude/daneel.json` holds this project's settings.

### Scripts

- `scripts/changed-scope.sh` — the checks each changed path needs. Never: runs a check.
- `scripts/scoped-checks.sh` — the fast checks of a change, for the hooks. Never:
  tests, coverage or a build.
- `scripts/check.py` — the quality checks of each layer, fast or full. Never: fixes
  what it reports unless asked to format.
- `scripts/harness.sh` — the merge gate of CI, locally, scoped to what moved; coverage with `--coverage`. Never: a
  gate CI does not have.
- `scripts/coverage-gate.py` — fails when coverage of the code that carries logic
  drops under its floor. Never: lowers a floor.
- `scripts/arch-check.py` — enforces the architecture rules a machine can check.
  Never: lets the allowlist grow.
- `scripts/rule-homes.py` — one location per document, one home per rule, one line
  here per piece, one ceiling per guide. Never: judges what a document says.
- `scripts/privacy-check.py` — keeps private data out of logs, files and commit
  messages. Never: prints the data it found.
- `scripts/review-stop-reason.py` — says in one line why a reviewer session stopped in
  CI. Never: fails the job it explains.
- `scripts/usage_log.py` — writes one line per run of a tool, locally. Never: in CI,
  nor anything about the data handled.
- `scripts/usage-log.sh` — the same line for a shell script. Never: changes the
  script's exit code.

### Git hooks

- `.githooks/pre-commit` — refuses a commit on the main branch or holding private
  data, then runs the fast checks of the staged files. Never: tests.
- `.githooks/commit-msg` — refuses a title outside the commit format, an attribution
  line, or private data. Never: rewrites the message.
- `.githooks/pre-push` — the fast checks of the pushed commits. Never: what CI owns.
- `.githooks/pre-merge-commit` — refuses a merge commit, so history stays linear.
  Never: blocks a fast-forward.

## This project

The pieces only this repository has: the reviewers of its stack, the tools of its build,
and those of its ceremony, a pull request (`docs/workflow.md` § 3).

- `scripts/start-app.sh` — starts the application in development mode. Never: touches
  the installed application's data.
- `scripts/core-without-tauri.sh` — proves the core builds without the desktop shell
  (B47). Never: builds the shell.
- `scripts/coverage-strip-tests.py` — removes inline Rust test modules from a coverage
  report. Never: removes production lines.
